import type { LLMProvider, ChatMessage, ToolDefinition, ToolCall } from './types';
import { StopReason } from './types';
import type { SSEEmitter } from '../sse';
import { SSEEventType, isProposalTool } from '../sse';
import type { CalendarEvent } from '../googleCalendar';
import type { BatchProposalEntry } from '../sse';

const MAX_ITERATIONS = 10;

export interface AgentLoopDeps {
  provider: LLMProvider;
  tools: ToolDefinition[];
  dispatchTool: (name: string, input: Record<string, unknown>) => Promise<string>;
  buildSystemPrompt: () => string;
}

export async function runAgentLoop(
  inputMessages: ChatMessage[],
  deps: AgentLoopDeps,
  emit: SSEEmitter,
): Promise<void> {
  const system = deps.buildSystemPrompt();
  const messages: ChatMessage[] = [...inputMessages];
  const pendingProposals: ToolCall[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    emit({ event: SSEEventType.Status, data: { type: 'thinking' } });

    const result = await deps.provider.stream(
      system,
      messages,
      deps.tools,
      (text) => emit({ event: SSEEventType.Delta, data: { text } }),
    );

    if (result.stopReason === StopReason.EndTurn) {
      // Flush any accumulated proposals before finishing, deduped by start time
      if (pendingProposals.length > 0) {
        const deduped = deduplicateProposals(pendingProposals.map(sanitizeProposal));
        emitProposals(deduped, emit);
      }
      emit({ event: SSEEventType.Done, data: {} });
      return;
    }

    if (result.toolCalls.length === 0) {
      messages.push({ role: 'assistant', text: result.text, toolCalls: [] });
      messages.push({ role: 'user', content: 'Please continue.' });
      continue;
    }

    const proposals = result.toolCalls.filter((tc) => isProposalTool(tc.name));
    const otherTools = result.toolCalls.filter((tc) => !isProposalTool(tc.name));

    if (proposals.length > 0) {
      // Accumulate proposals and send tool results so the model can continue
      pendingProposals.push(...proposals);
      messages.push({ role: 'assistant', text: result.text, toolCalls: result.toolCalls });
      messages.push(...proposals.map((tc) => ({
        role: 'tool_result' as const,
        toolCallId: tc.id,
        content: 'Proposal shown to user.',
      })));

      // If there were also non-proposal tools in the same response, dispatch them
      if (otherTools.length > 0) {
        const toolResults = await dispatchAll(otherTools, deps.dispatchTool, emit);
        messages.push(...toolResults);
      }
      continue;
    }

    const toolResults = await dispatchAll(result.toolCalls, deps.dispatchTool, emit);
    messages.push({ role: 'assistant', text: result.text, toolCalls: result.toolCalls });
    messages.push(...toolResults);
  }

  emit({
    event: SSEEventType.Error,
    data: { message: 'Too many tool calls — please try a simpler question.' },
  });
  emit({ event: SSEEventType.Done, data: {} });
}

function toCalendarEvent(input: Record<string, unknown>): CalendarEvent {
  return {
    id: (input.id as string) ?? '',
    title: (input.title as string) ?? 'Untitled',
    start: (input.start as string) ?? '',
    end: (input.end as string) ?? '',
    allDay: Boolean(input.allDay),
    attendees: Array.isArray(input.attendees)
      ? input.attendees.filter((e): e is string => typeof e === 'string').map((email) => ({ email }))
      : undefined,
    location: input.location as string | undefined,
    description: input.description as string | undefined,
  };
}

function toAction(input: Record<string, unknown>): 'create' | 'update' | 'delete' {
  return (['create', 'update', 'delete'].includes(input.action as string)
    ? input.action as 'create' | 'update' | 'delete'
    : 'create');
}

function emitProposals(toolCalls: ToolCall[], emit: SSEEmitter): void {
  // Group by action — 2+ same-action proposals become a batch_proposal; singletons stay event_proposal
  const byAction = new Map<string, ToolCall[]>();
  for (const tc of toolCalls) {
    const action = toAction(tc.input);
    const group = byAction.get(action) ?? [];
    group.push(tc);
    byAction.set(action, group);
  }

  for (const [, group] of byAction) {
    if (group.length >= 2) {
      const entries: BatchProposalEntry[] = group.map((tc) => ({
        id: tc.id,
        action: toAction(tc.input),
        event: toCalendarEvent(tc.input),
      }));
      emit({
        event: SSEEventType.BatchProposal,
        data: { batchId: crypto.randomUUID(), entries },
      });
    } else {
      const tc = group[0];
      emit({
        event: SSEEventType.EventProposal,
        data: {
          id: tc.id,
          action: toAction(tc.input),
          event: toCalendarEvent(tc.input),
        },
      });
    }
  }
}

/** Cleans up a propose_event tool call, extracting fields even if the model mangled the JSON. */
/** Removes duplicate proposals (same start + end time). Keeps first occurrence. */
function deduplicateProposals(proposals: ToolCall[]): ToolCall[] {
  const seen = new Set<string>();
  return proposals.filter((tc) => {
    const key = `${tc.input.start}|${tc.input.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sanitizeProposal(tc: ToolCall): ToolCall {
  const input = { ...tc.input };

  // The model sometimes embeds XML-like content in the id field that contains the title.
  // Extract a clean title from wherever we can find it.
  const rawId = typeof input.id === 'string' ? input.id : '';
  const rawTitle = typeof input.title === 'string' ? input.title : '';

  // If id contains non-ID content (XML tags, long strings), it's mangled — clear it.
  if (rawId.length > 100 || rawId.includes('<') || rawId.includes('\n')) {
    input.id = '';
  }

  // If title is missing but we can find something usable, fall back.
  if (!rawTitle.trim()) {
    input.title = 'Meeting';
  }

  return { ...tc, input };
}

async function dispatchAll(
  toolCalls: ToolCall[],
  dispatch: (name: string, input: Record<string, unknown>) => Promise<string>,
  emit: SSEEmitter,
): Promise<ChatMessage[]> {
  return Promise.all(
    toolCalls.map(async (tc): Promise<ChatMessage> => {
      emit({ event: SSEEventType.ToolCall, data: { tool: tc.name } });
      try {
        const result = await dispatch(tc.name, tc.input);
        emit({ event: SSEEventType.ToolResult, data: { tool: tc.name, summary: 'Completed' } });
        return { role: 'tool_result', toolCallId: tc.id, content: result };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        emit({
          event: SSEEventType.ToolResult,
          data: { tool: tc.name, summary: errMsg, error: true },
        });
        return { role: 'tool_result', toolCallId: tc.id, content: `Error: ${errMsg}`, isError: true };
      }
    }),
  );
}
