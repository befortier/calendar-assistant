import Anthropic from '@anthropic-ai/sdk';
import type { GoogleCalendarService } from './googleCalendar';
import { calendarTools, dispatchTool, type ToolName } from './calendarSkill';

export interface UserContext {
  email: string;
  timezone: string;
  now?: Date; // injectable for testing, defaults to new Date()
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
const MODEL = 'claude-sonnet-4-20250514';

export class ClaudeService {
  constructor(private readonly client: Anthropic) {}

  async runAgentLoop(
    inputMessages: Anthropic.MessageParam[],
    calendarService: GoogleCalendarService,
    ctx: UserContext,
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt(ctx);
    const messages = [...inputMessages];

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: calendarTools,
        messages,
      });

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b) => b.type === 'text');
        return textBlock?.type === 'text' ? textBlock.text : '';
      }

      // Tool use handling will be added in the next task
      throw new Error(`Unhandled stop_reason: ${response.stop_reason}`);
    }

    return 'I ran into an issue processing your request — too many tool calls. Please try a simpler question.';
  }
}
