import Anthropic from '@anthropic-ai/sdk';
import type { GoogleCalendarService } from './googleCalendar';
import { calendarTools, dispatchTool, type ToolName } from './calendarSkill';
import { type SSEEmitter, isProposalTool } from './sse';

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
2. Call propose_event to show time options as interactive cards. Call it MULTIPLE TIMES in one response for multiple options. Do NOT list times in plain text.
3. After the user picks an option (or says "any work", "first one", etc.), call create_event immediately. Affirmative replies count as confirmation — do not re-check.

Updating/deleting workflow:
1. Use get_events to find the event.
2. Call propose_event with the event id and the proposed changes (or current details for delete) so the user sees a confirmation card.
3. After the user confirms, call update_event or delete_event.

Rules:
- propose_event is display-only — it shows a card but does NOT modify the calendar.
- create_event, update_event, delete_event are real writes — only call them after the user confirms.
- The id for update/delete MUST come from a prior get_events or create_event result. Never invent IDs.
- For new events, pass id as an empty string.
- get_events and get_freebusy are read-only — call freely.

When displaying events or times, use the user's timezone (${ctx.timezone}).`;
}

const MAX_ITERATIONS = 10;
const MODEL = 'claude-sonnet-4-6';

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

      // propose_event calls → emit as EventCards and stop
      const proposals = toolUseBlocks.filter((b) => isProposalTool(b.name));
      if (proposals.length > 0) {
        this.emitProposals(proposals, emit);
        emit({ event: 'done', data: {} });
        return;
      }

      // All other tools (reads + writes) → dispatch
      const toolResults = await this.dispatchTools(toolUseBlocks, calendarService, emit);
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

  private emitProposals(blocks: Anthropic.ToolUseBlock[], emit: SSEEmitter): void {
    const group = blocks.length > 1 ? crypto.randomUUID() : undefined;

    for (const block of blocks) {
      const input = block.input as Record<string, unknown>;
      emit({
        event: 'event_proposal',
        data: {
          id: block.id,
          action: 'create',
          group,
          event: {
            id: (input.id as string) ?? '',
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
}
