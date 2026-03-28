# LLM Provider Abstraction Design

> **For Claude:** After human approval, use plan2beads to convert this plan to a beads epic, then use `superpowers-bd:subagent-driven-development` for parallel execution.

**Goal:** Extract the agent loop from `ClaudeService` into a provider-agnostic orchestrator, so adding OpenAI (or any LLM) requires only a new adapter — no changes to the loop, tool dispatch, or SSE emission.

**Architecture:** Three layers — a normalized type system (`agent/types.ts`), a provider-agnostic agent loop (`agent/agentLoop.ts`), and provider-specific adapters (`providers/claude/claudeAdapter.ts`). Tool definitions are canonical and provider-neutral. Each adapter translates our types to/from the provider SDK. The agent loop owns orchestration, proposal detection, and tool dispatch.

**Tech Stack:** TypeScript, Anthropic SDK (Claude adapter), Vitest

**Key Decisions:**
- **Callback-based streaming over AsyncIterator:** Provider calls `onDelta(text)` during streaming, returns a typed `StreamResult` when done. Simpler than an iterator, and the agent loop doesn't need to care about streaming mechanics.
- **Tool results as ChatMessage union:** The agent loop builds `ChatMessage[]` including `tool_result` role messages. The provider adapter serializes all message types for its SDK. No provider types leak into the loop.
- **Proposal detection in the agent loop:** `propose_event` interception stays in the loop as a business rule, not in a separate middleware layer. The loop is already the orchestrator.
- **Tool dispatch stays in calendarSkill.ts:** It's calendar-domain logic (knows about `GoogleCalendarService`, `CreateEventInput`, `invertBusy`). The agent loop receives it as an injected function.
- **StopReason and SSEEventType as const objects:** No string literals scattered through the codebase. Provider adapters reference `StopReason.EndTurn` when normalizing. SSE emit uses `SSEEventType.Done` with named payload interfaces.

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `server/src/services/agent/types.ts` | Normalized types: ChatMessage, ToolCall, ToolDefinition, StreamResult, StopReason, LLMProvider | Create |
| `server/src/services/agent/tools.ts` | Provider-neutral calendar tool definitions (ToolDefinition[]) | Create |
| `server/src/services/agent/agentLoop.ts` | Provider-agnostic iteration, proposal detection, tool dispatch, SSE emission | Create |
| `server/src/services/agent/systemPrompt.ts` | UserContext type + buildSystemPrompt function | Create |
| `server/src/services/providers/claude/claudeAdapter.ts` | LLMProvider implementation: Anthropic SDK streaming, type translation | Create |
| `server/src/services/calendarSkill.ts` | Remove tool schema exports, keep dispatchTool + validation helpers | Modify |
| `server/src/services/sse.ts` | Add SSEEventType const, named payload interfaces, keep formatSSE/isProposalTool | Modify |
| `server/src/services/claude.ts` | Delete — all logic moved to agentLoop + claudeAdapter + systemPrompt | Delete |
| `server/src/routes/chat.ts` | Wire AgentLoopDeps with provider, tools, dispatchTool, buildSystemPrompt | Modify |
| `server/src/index.ts` | Create ClaudeAdapter at startup, inject as LLMProvider | Modify |
| `server/src/services/agent/agentLoop.test.ts` | Agent loop tests with mocked LLMProvider + dispatchTool | Create |
| `server/src/services/providers/claude/claudeAdapter.test.ts` | Adapter translation tests with mocked Anthropic client | Create |
| `server/src/services/calendarSkill.test.ts` | Remove schema-related tests (move to tools.test.ts if needed) | Modify |
| `server/src/services/claude.test.ts` | Delete — tests split into agentLoop.test.ts + claudeAdapter.test.ts | Delete |

---

## Normalized Types (`agent/types.ts`)

```ts
/** Stop reasons normalized across all LLM providers. */
export const StopReason = {
  EndTurn: 'end_turn',
  ToolUse: 'tool_use',
  MaxTokens: 'max_tokens',
} as const;

export type StopReason = (typeof StopReason)[keyof typeof StopReason];

/** Provider-neutral tool schema. Each adapter converts to its own format. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  strict?: boolean;
}

/** A tool call extracted from the LLM response. */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** All message types that flow through the agent loop. */
export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[] }
  | { role: 'tool_result'; toolCallId: string; content: string; isError?: boolean };

/** What the provider returns after streaming completes. */
export interface StreamResult {
  stopReason: StopReason;
  text: string;
  toolCalls: ToolCall[];
}

/** The contract every LLM provider must implement. */
export interface LLMProvider {
  stream(
    system: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onDelta: (text: string) => void,
  ): Promise<StreamResult>;
}
```

## SSE Event Types (revised `sse.ts`)

```ts
import type { CalendarEvent } from './googleCalendar';

export const SSEEventType = {
  Status: 'status',
  Delta: 'delta',
  ToolCall: 'tool_call',
  ToolResult: 'tool_result',
  EventProposal: 'event_proposal',
  Done: 'done',
  Error: 'error',
} as const;

export type SSEEventType = (typeof SSEEventType)[keyof typeof SSEEventType];

export interface StatusPayload { type: 'thinking' }
export interface DeltaPayload { text: string }
export interface ToolCallPayload { tool: string }
export interface ToolResultPayload { tool: string; summary: string; error?: boolean }
export interface EventProposalPayload {
  id: string;
  action: 'create' | 'update' | 'delete';
  event: CalendarEvent;
  group?: string;
}
export interface DonePayload {}
export interface ErrorPayload { message: string }

export type SSEEvent =
  | { event: typeof SSEEventType.Status; data: StatusPayload }
  | { event: typeof SSEEventType.Delta; data: DeltaPayload }
  | { event: typeof SSEEventType.ToolCall; data: ToolCallPayload }
  | { event: typeof SSEEventType.ToolResult; data: ToolResultPayload }
  | { event: typeof SSEEventType.EventProposal; data: EventProposalPayload }
  | { event: typeof SSEEventType.Done; data: DonePayload }
  | { event: typeof SSEEventType.Error; data: ErrorPayload };

export type SSEEmitter = (event: SSEEvent) => void;

export function isProposalTool(name: string): boolean {
  return name === 'propose_event';
}

export function formatSSE(event: SSEEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
```

## Tool Registry (`agent/tools.ts`)

Provider-neutral `ToolDefinition[]`. Same content as today's `calendarTools` but without Anthropic types. The `eventProperties` shared object stays. Each tool has `name`, `description`, `inputSchema`, and optional `strict`.

## System Prompt Builder (`agent/systemPrompt.ts`)

```ts
export interface UserContext {
  email: string;
  timezone: string;
  now?: Date;
}

export function buildSystemPrompt(ctx: UserContext): string {
  const now = ctx.now ?? new Date();
  return `You are a helpful calendar assistant for ${ctx.email}.
...identical prompt content...`;
}
```

## Claude Adapter (`providers/claude/claudeAdapter.ts`)

```ts
import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, ChatMessage, ToolDefinition, StreamResult, ToolCall } from '../../agent/types';
import { StopReason } from '../../agent/types';

export class ClaudeAdapter implements LLMProvider {
  constructor(
    private readonly client: Anthropic,
    private readonly model = 'claude-sonnet-4-6',
  ) {}

  async stream(
    system: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onDelta: (text: string) => void,
  ): Promise<StreamResult> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system,
      tools: tools.map(toAnthropicTool),
      messages: messages.map(toAnthropicMessage),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onDelta(event.delta.text);
      }
    }

    return normalizeResponse(await stream.finalMessage());
  }
}

function toAnthropicTool(def: ToolDefinition): Anthropic.Tool {
  return {
    name: def.name,
    description: def.description,
    input_schema: {
      ...def.inputSchema,
      ...(def.strict ? { additionalProperties: false } : {}),
    },
    ...(def.strict ? { strict: true } : {}),
  };
}

function toAnthropicMessage(msg: ChatMessage): Anthropic.MessageParam {
  switch (msg.role) {
    case 'user':
      return { role: 'user', content: msg.content };
    case 'assistant': {
      const content: Anthropic.ContentBlock[] = [];
      if (msg.text) content.push({ type: 'text', text: msg.text });
      for (const tc of msg.toolCalls) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
      return { role: 'assistant', content };
    }
    case 'tool_result':
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.toolCallId,
          content: msg.content,
          ...(msg.isError ? { is_error: true } : {}),
        }],
      };
  }
}

function normalizeResponse(msg: Anthropic.Message): StreamResult {
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const toolCalls: ToolCall[] = msg.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

  const stopReason =
    msg.stop_reason === 'tool_use' ? StopReason.ToolUse
    : msg.stop_reason === 'max_tokens' ? StopReason.MaxTokens
    : StopReason.EndTurn;

  return { stopReason, text, toolCalls };
}
```

## Agent Loop (`agent/agentLoop.ts`)

```ts
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
  const messages = [...inputMessages];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    emit({ event: SSEEventType.Status, data: { type: 'thinking' } });

    const result = await deps.provider.stream(
      system, messages, deps.tools,
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
      emitProposals(proposals, emit);
      emit({ event: SSEEventType.Done, data: {} });
      return;
    }

    const toolResults = await dispatchAll(result.toolCalls, deps.dispatchTool, emit);
    messages.push({ role: 'assistant', text: result.text, toolCalls: result.toolCalls });
    messages.push(...toolResults);
  }

  emit({ event: SSEEventType.Error, data: { message: 'Too many tool calls — please try a simpler question.' } });
  emit({ event: SSEEventType.Done, data: {} });
}

function emitProposals(toolCalls: ToolCall[], emit: SSEEmitter): void {
  const group = toolCalls.length > 1 ? crypto.randomUUID() : undefined;
  for (const tc of toolCalls) {
    const input = tc.input;
    emit({
      event: SSEEventType.EventProposal,
      data: {
        id: tc.id,
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
        emit({ event: SSEEventType.ToolResult, data: { tool: tc.name, summary: errMsg, error: true } });
        return { role: 'tool_result', toolCallId: tc.id, content: `Error: ${errMsg}`, isError: true };
      }
    }),
  );
}
```

## Wiring in `chat.ts`

```ts
import { runAgentLoop } from '../services/agent/agentLoop';
import { calendarTools } from '../services/agent/tools';
import { buildSystemPrompt } from '../services/agent/systemPrompt';
import { dispatchTool } from '../services/calendarSkill';
import { formatSSE } from '../services/sse';
import type { LLMProvider } from '../services/agent/types';

export interface ChatRouterDeps {
  users: IUserRepository;
  provider: LLMProvider;
  calendarServiceFactory: (accessToken: string, refreshToken: string) => GoogleCalendarService;
}

// Inside handler:
const calendarService = deps.calendarServiceFactory(user.accessToken, user.refreshToken);

await runAgentLoop(
  parsed.data.messages.map((m) => ({ role: m.role, content: m.content })),
  {
    provider: deps.provider,
    tools: calendarTools,
    dispatchTool: (name, input) => dispatchTool(name, input, calendarService),
    buildSystemPrompt: () => buildSystemPrompt({
      email: user.email,
      timezone: parsed.data.timezone,
    }),
  },
  (event) => { if (!closed) res.write(formatSSE(event)); },
);
```

## Testing

**`agentLoop.test.ts`** — mock `LLMProvider` returning canned `StreamResult`s, mock `dispatchTool`. Tests all orchestration: text-only, tool dispatch, proposals, errors, max iterations, immutability.

**`claudeAdapter.test.ts`** — mock Anthropic client. Tests type translation: `ToolDefinition → Anthropic.Tool`, `ChatMessage → MessageParam`, `Message → StreamResult`, delta forwarding.

**`calendarSkill.test.ts`** — unchanged dispatch tests. Remove `calendarTools` schema references.

## What Gets Deleted

- `server/src/services/claude.ts` — all logic moves to agentLoop + claudeAdapter + systemPrompt
- `server/src/services/claude.test.ts` — tests split into agentLoop.test.ts + claudeAdapter.test.ts
