import type { LLMProvider, ChatMessage, ToolDefinition, ToolCall } from './types';
import { StopReason } from './types';
import type { SSEEmitter } from '../sse';
import { SSEEventType, isProposalTool } from '../sse';
import type { CalendarEvent } from '../googleCalendar';

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

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    emit({ event: SSEEventType.Status, data: { type: 'thinking' } });

    const result = await deps.provider.stream(
      system,
      messages,
      deps.tools,
      (text) => emit({ event: SSEEventType.Delta, data: { text } }),
    );

    if (result.stopReason === StopReason.EndTurn) {
      emit({ event: SSEEventType.Done, data: {} });
      return;
    }

    if (result.toolCalls.length === 0) {
      messages.push({ role: 'assistant', text: result.text, toolCalls: [] });
      messages.push({ role: 'user', content: 'Please continue.' });
      continue;
    }

    const proposals = result.toolCalls.filter((tc) => isProposalTool(tc.name));
    if (proposals.length > 0) {
      const invalid = validateProposals(proposals);
      if (invalid) {
        // Reject and force retry — send tool_result errors back to the model
        messages.push({ role: 'assistant', text: result.text, toolCalls: result.toolCalls });
        messages.push(...proposals.map((tc) => ({
          role: 'tool_result' as const,
          toolCallId: tc.id,
          content: invalid,
          isError: true,
        })));
        continue;
      }
      emitProposals(proposals, emit);
      emit({ event: SSEEventType.Done, data: {} });
      return;
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

function emitProposals(toolCalls: ToolCall[], emit: SSEEmitter): void {
  const group = toolCalls.length > 1 ? crypto.randomUUID() : undefined;
  for (const tc of toolCalls) {
    const input = tc.input;
    const event: CalendarEvent = {
      id: (input.id as string) ?? '',
      title: (input.title as string) ?? 'Untitled',
      start: (input.start as string) ?? '',
      end: (input.end as string) ?? '',
      allDay: false,
      attendees: input.attendees as string[] | undefined,
      location: input.location as string | undefined,
      description: input.description as string | undefined,
    };
    emit({
      event: SSEEventType.EventProposal,
      data: {
        id: tc.id,
        action: 'create',
        group,
        event,
      },
    });
  }
}

/** Returns an error message if any proposal is invalid, or null if all are valid. */
function validateProposals(proposals: ToolCall[]): string | null {
  for (const tc of proposals) {
    const input = tc.input;
    if (!input.title || (typeof input.title === 'string' && input.title.trim() === '')) {
      return 'Error: propose_event requires a non-empty title. Use the meeting name the user mentioned.';
    }
    if (!input.start || !input.end) {
      return 'Error: propose_event requires start and end times.';
    }
  }
  return null;
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
