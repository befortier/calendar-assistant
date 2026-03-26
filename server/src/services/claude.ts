import Anthropic from '@anthropic-ai/sdk';
import type { GoogleCalendarService, CalendarEvent } from './googleCalendar';
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
2. Use propose_options to show time slots as interactive cards the user can pick from. Do NOT list times in plain text.
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

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      emit({ event: 'status', data: { type: 'thinking' } });

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

      const response = await stream.finalMessage();

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

      // Check for intercepted tools — emit proposals and stop
      const intercepted = toolUseBlocks.find((b) => isInterceptedTool(b.name));
      if (intercepted) {
        if (intercepted.name === 'propose_options') {
          this.emitOptions(intercepted, emit);
        } else {
          this.emitWriteProposal(intercepted, emit);
        }
        emit({ event: 'done', data: {} });
        return;
      }

      // Dispatch read tools
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (block) => {
          emit({ event: 'tool_call', data: { tool: block.name } });
          try {
            const result = await dispatchTool(
              block.name as ToolName,
              block.input as Record<string, unknown>,
              calendarService,
            );
            emit({ event: 'tool_result', data: { tool: block.name, summary: `Completed` } });
            return { type: 'tool_result' as const, tool_use_id: block.id, content: result };
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            emit({ event: 'tool_result', data: { tool: block.name, summary: errMsg, error: true } });
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: `Error: ${errMsg}`,
              is_error: true,
            };
          }
        }),
      );

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }

    emit({ event: 'error', data: { message: 'Too many tool calls — please try a simpler question.' } });
    emit({ event: 'done', data: {} });
  }

  private emitWriteProposal(block: Anthropic.ToolUseBlock, emit: SSEEmitter): void {
    const input = block.input as Record<string, unknown>;
    const action = WRITE_TOOL_ACTION[block.name];
    emit({
      event: 'event_proposal',
      data: {
        id: block.id,
        action,
        event: {
          id: (input.event_id as string) ?? '',
          title: (input.title as string) ?? 'Untitled',
          start: (input.start as string) ?? '',
          end: (input.end as string) ?? '',
          allDay: false,
          attendees: input.attendees as string[] | undefined,
          location: input.location as string | undefined,
          description: input.description as string | undefined,
        },
      },
    });
  }

  private emitOptions(block: Anthropic.ToolUseBlock, emit: SSEEmitter): void {
    const input = block.input as Record<string, unknown>;
    const title = (input.title as string) ?? 'Untitled';
    const attendees = input.attendees as string[] | undefined;
    const description = input.description as string | undefined;
    const location = input.location as string | undefined;
    const options = input.options as { start: string; end: string }[];
    const group = block.id;

    for (let i = 0; i < options.length; i++) {
      emit({
        event: 'event_proposal',
        data: {
          id: `${group}_${i}`,
          action: 'create',
          group,
          event: {
            id: '',
            title,
            start: options[i].start,
            end: options[i].end,
            allDay: false,
            attendees,
            description,
            location,
          },
        },
      });
    }
  }
}
