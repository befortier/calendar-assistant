import Anthropic from '@anthropic-ai/sdk';
import type { GoogleCalendarService } from './googleCalendar';
import { calendarTools, dispatchTool, type ToolName } from './calendarSkill';
import { type SSEEmitter, isInterceptedTool } from './sse';

export interface UserContext {
  email: string;
  timezone: string;
  now?: Date;
}

export function buildSystemPrompt(ctx: UserContext): string {
  const now = ctx.now ?? new Date();
  return `You are a helpful calendar assistant for ${ctx.email}.

Current date and time: ${now.toISOString()}
User timezone: ${ctx.timezone}

You have access to tools that read and modify the user's Google Calendar.

Scheduling workflow:
1. When the user asks to schedule something, use get_events/get_freebusy to find availability.
2. To propose time options, call create_event MULTIPLE TIMES in a single response — one call per option. Each will appear as an interactive card the user can pick from. Do NOT list times in plain text.
3. After the user picks an option (or says "any work", "first one", etc.), call create_event immediately. Affirmative replies ("yes", "sure", "sounds good", "go ahead", "any work", "pick one") count as confirmation — do not re-check.

Write-operation rules:
- For create_event: if the user has expressed clear intent and you have the details, proceed. You do NOT need explicit "yes" for every field — reasonable defaults are fine.
- For update_event and delete_event: confirm which specific event before proceeding.
- The event_id for update/delete MUST come from a prior get_events or create_event result. Never invent IDs.

For get_events and get_freebusy: call these freely whenever useful — they are read-only.

When displaying events or times to the user, use their timezone (${ctx.timezone}).`;
}

const MAX_ITERATIONS = 10;
const MODEL = 'claude-sonnet-4-6';

const WRITE_TOOL_ACTION: Record<string, 'create' | 'update' | 'delete'> = {
  create_event: 'create',
  update_event: 'update',
  delete_event: 'delete',
};

/** Extract events from tool result JSON and add to cache. */
function cacheEventsFromResults(
  results: Anthropic.ToolResultBlockParam[],
  cache: Map<string, Record<string, unknown>>,
): void {
  for (const tr of results) {
    if (tr.is_error || typeof tr.content !== 'string') continue;
    try {
      const parsed = JSON.parse(tr.content);
      const events = Array.isArray(parsed) ? parsed : [parsed];
      for (const evt of events) {
        if (evt.id) cache.set(evt.id, evt);
      }
    } catch { /* not JSON */ }
  }
}

function isConfirmed(inputMessages: Anthropic.MessageParam[]): boolean {
  const last = inputMessages[inputMessages.length - 1];
  if (!last || last.role !== 'user' || typeof last.content !== 'string') return false;
  return last.content.startsWith('Yes,') || last.content.startsWith('No,');
}

export class ClaudeService {
  constructor(private readonly client: Anthropic) {}

  async streamAgentLoop(
    inputMessages: Anthropic.MessageParam[],
    calendarService: GoogleCalendarService,
    ctx: UserContext,
    emit: SSEEmitter,
  ): Promise<void> {
    const systemPrompt = buildSystemPrompt(ctx);
    const messages = [...inputMessages];
    const knownEvents = new Map<string, Record<string, unknown>>();

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      emit({ event: 'status', data: { type: 'thinking' } });
      const response = await this.streamResponse(systemPrompt, messages, emit);

      if (response.stop_reason === 'end_turn') {
        emit({ event: 'done', data: {} });
        return;
      }

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) {
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: 'Please continue.' });
        continue;
      }

      if (this.emitProposalsIfNeeded(toolUseBlocks, inputMessages, knownEvents, emit)) return;

      const toolResults = await this.dispatchTools(toolUseBlocks, calendarService, emit);
      cacheEventsFromResults(toolResults, knownEvents);
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }

    emit({ event: 'error', data: { message: 'Too many tool calls — please try a simpler question.' } });
    emit({ event: 'done', data: {} });
  }

  private async streamResponse(
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
    emit: SSEEmitter,
  ): Promise<Anthropic.Message> {
    const stream = this.client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: calendarTools,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        emit({ event: 'delta', data: { text: event.delta.text } });
      }
    }

    return stream.finalMessage();
  }

  private emitProposalsIfNeeded(
    toolUseBlocks: Anthropic.ToolUseBlock[],
    inputMessages: Anthropic.MessageParam[],
    knownEvents: Map<string, Record<string, unknown>>,
    emit: SSEEmitter,
  ): boolean {
    const writeBlocks = toolUseBlocks.filter((b) => isInterceptedTool(b.name));
    console.log(`[agent] tools: ${toolUseBlocks.map((b) => b.name).join(', ')}, confirmed: ${isConfirmed(inputMessages)}`);
    if (writeBlocks.length === 0 || isConfirmed(inputMessages)) return false;

    const group = writeBlocks.length > 1 ? crypto.randomUUID() : undefined;
    for (const block of writeBlocks) {
      this.emitWriteProposal(block, emit, group, knownEvents);
    }
    emit({ event: 'done', data: {} });
    return true;
  }

  private async dispatchTools(
    blocks: Anthropic.ToolUseBlock[],
    calendarService: GoogleCalendarService,
    emit: SSEEmitter,
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    return Promise.all(
      blocks.map(async (block) => {
        emit({ event: 'tool_call', data: { tool: block.name } });
        console.log(`[agent] dispatching ${block.name}`);
        try {
          const result = await dispatchTool(
            block.name as ToolName,
            block.input as Record<string, unknown>,
            calendarService,
          );
          console.log(`[agent] ${block.name} succeeded`);
          emit({ event: 'tool_result', data: { tool: block.name, summary: 'Completed' } });
          return { type: 'tool_result' as const, tool_use_id: block.id, content: result };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[agent] ${block.name} FAILED: ${errMsg}`);
          emit({ event: 'tool_result', data: { tool: block.name, summary: errMsg, error: true } });
          return { type: 'tool_result' as const, tool_use_id: block.id, content: `Error: ${errMsg}`, is_error: true };
        }
      }),
    );
  }

  private emitWriteProposal(
    block: Anthropic.ToolUseBlock,
    emit: SSEEmitter,
    group?: string,
    knownEvents?: Map<string, Record<string, unknown>>,
  ): void {
    const input = block.input as Record<string, unknown>;
    const action = WRITE_TOOL_ACTION[block.name];
    const eventId = (input.event_id as string) ?? '';

    // For update/delete, merge tool input on top of known event data
    const base = knownEvents?.get(eventId) ?? {};
    const merged = { ...base, ...input };

    emit({
      event: 'event_proposal',
      data: {
        id: block.id,
        action,
        group,
        event: {
          id: eventId,
          title: (merged.title as string) ?? 'Untitled',
          start: (merged.start as string) ?? '',
          end: (merged.end as string) ?? '',
          allDay: false,
          attendees: merged.attendees as string[] | undefined,
          location: merged.location as string | undefined,
          description: merged.description as string | undefined,
        },
      },
    });
  }
}
