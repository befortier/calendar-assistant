import Anthropic from '@anthropic-ai/sdk';
import type { GoogleCalendarService, CalendarEvent } from './googleCalendar';
import { calendarTools, dispatchTool, type ToolName } from './calendarSkill';
import { type SSEEmitter, isWriteTool } from './sse';

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

IMPORTANT — write-operation rules (you MUST follow these):
- NEVER call create_event, update_event, or delete_event without first presenting the full details to the user and receiving their explicit confirmation.
- "Sounds good", "sure", or "yes" in response to your proposal counts as confirmation.
- Ambiguous requests like "schedule something" do NOT count — you must propose specific details and wait for approval.
- If the user asks you to "just do it" or "go ahead" without you having proposed details first, propose the details and ask for confirmation.
- For delete_event: always confirm which specific event will be deleted by name and time before proceeding.

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

      // Check for write tools — emit proposal and stop
      const writeBlock = toolUseBlocks.find((b) => isWriteTool(b.name));
      if (writeBlock) {
        const input = writeBlock.input as Record<string, unknown>;
        const action = WRITE_TOOL_ACTION[writeBlock.name];
        const event: CalendarEvent = {
          id: (input.event_id as string) ?? '',
          title: (input.title as string) ?? 'Untitled',
          start: (input.start as string) ?? '',
          end: (input.end as string) ?? '',
          allDay: false,
          attendees: input.attendees as string[] | undefined,
          location: input.location as string | undefined,
          description: input.description as string | undefined,
        };

        emit({
          event: 'event_proposal',
          data: { id: writeBlock.id, action, event },
        });
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
}
