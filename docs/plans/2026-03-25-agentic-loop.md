# Agentic Loop Implementation Plan

> **For Claude:** After human approval, use plan2beads to convert this plan to a beads epic, then use `superpowers-bd:subagent-driven-development` for parallel execution.

**Goal:** Implement a Claude-powered agent loop that processes user messages, calls calendar tools as needed, and returns a final text response.

**Architecture:** A `ClaudeService` class wraps the Anthropic SDK and exposes a `runAgentLoop` method. It builds a system prompt with user context, sends messages to Claude with `calendarTools`, and loops on tool_use responses — dispatching each tool call via the existing `dispatchTool` function and feeding results back until Claude returns text. The service is fully injectable for testing.

**Tech Stack:** TypeScript, @anthropic-ai/sdk ^0.80.0, Vitest

**Key Decisions:**
- **DI over construction:** `ClaudeService` receives an Anthropic client instance rather than constructing one — enables test mocking without network calls.
- **Prompt-only write gate:** No server-side confirmation mechanism. The system prompt and tool descriptions strongly instruct Claude to ask before write operations. Simpler first version; server-side gate can be added later.
- **Prompt-only event ID tracking:** No server-side `Set<string>` of seen IDs. Tool descriptions tell Claude to only use IDs from prior results. Google API 404 is the fallback if Claude hallucinates.
- **Hard iteration cap:** Max 10 loop iterations to prevent runaway tool calls. Returns an error message to the user if exceeded.
- **Model pinned to `claude-sonnet-4-20250514`:** Good balance of speed and capability for a calendar assistant. Easy to change later via the constructor.

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `server/src/services/claude.ts` | ClaudeService class — system prompt builder + agent loop | Create |
| `server/src/services/claude.test.ts` | Tests for ClaudeService | Create |

---

## Task 1: System prompt builder

**Depends on:** None
**Complexity:** simple
**Files:**
- Create: `server/src/services/claude.ts`
- Create: `server/src/services/claude.test.ts`

**Purpose:** Build the system prompt that injects user email, current date, and timezone, with strong instructions around write-operation confirmation.

**Step 1: Write the failing test**

In `server/src/services/claude.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, ClaudeService } from './claude';
import type { GoogleCalendarService } from './googleCalendar';

function mockAnthropicClient(response: unknown) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue(response),
    },
  } as unknown as Anthropic;
}

function mockCalendarService(): GoogleCalendarService {
  return {
    getEvents: vi.fn(),
    getFreeBusy: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
  } as unknown as GoogleCalendarService;
}

const CTX = { email: 'alice@example.com', timezone: 'America/New_York', now: new Date('2026-03-25T10:00:00Z') };

describe('buildSystemPrompt', () => {
  it('includes the user email', () => {
    const prompt = buildSystemPrompt({
      email: 'alice@example.com',
      timezone: 'America/New_York',
      now: new Date('2026-03-25T10:00:00Z'),
    });
    expect(prompt).toContain('alice@example.com');
  });

  it('includes the current date', () => {
    const prompt = buildSystemPrompt({
      email: 'alice@example.com',
      timezone: 'America/New_York',
      now: new Date('2026-03-25T10:00:00Z'),
    });
    expect(prompt).toContain('2026-03-25');
  });

  it('includes the timezone', () => {
    const prompt = buildSystemPrompt({
      email: 'alice@example.com',
      timezone: 'America/New_York',
      now: new Date('2026-03-25T10:00:00Z'),
    });
    expect(prompt).toContain('America/New_York');
  });

  it('includes write-confirmation instructions', () => {
    const prompt = buildSystemPrompt({
      email: 'alice@example.com',
      timezone: 'America/New_York',
      now: new Date('2026-03-25T10:00:00Z'),
    });
    expect(prompt).toMatch(/confirm/i);
    expect(prompt).toMatch(/create_event|update_event|delete_event/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test --workspace=server -- --reporter=verbose src/services/claude.test.ts`
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

In `server/src/services/claude.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `npm test --workspace=server -- --reporter=verbose src/services/claude.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

`git add server/src/services/claude.ts server/src/services/claude.test.ts`
`git commit -m "feat(cal-0ho): system prompt builder with write-confirmation instructions"`

---

## Task 2: Agent loop — end_turn path (no tool calls)

**Depends on:** Task 1
**Complexity:** standard
**Files:**
- Modify: `server/src/services/claude.ts`
- Modify: `server/src/services/claude.test.ts`

**Purpose:** Implement the core `runAgentLoop` method handling the simplest case: Claude responds with text only (no tool calls).

**Step 1: Write the failing test**

Append to `server/src/services/claude.test.ts` (imports, helpers, and `CTX` were already added in Task 1):

```typescript
describe('ClaudeService.runAgentLoop', () => {
  it('returns text response when Claude ends turn without tool calls', async () => {
    const client = mockAnthropicClient({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'You have 3 meetings today.' }],
    });
    const service = new ClaudeService(client);

    const result = await service.runAgentLoop(
      [{ role: 'user', content: 'What do I have today?' }],
      mockCalendarService(),
      CTX,
    );

    expect(result).toBe('You have 3 meetings today.');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test --workspace=server -- --reporter=verbose src/services/claude.test.ts`
Expected: FAIL (ClaudeService not exported / runAgentLoop not defined)

**Step 3: Write minimal implementation**

Add to `server/src/services/claude.ts`:

```typescript
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
    const messages = [...inputMessages]; // defensive copy — don't mutate caller's array

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
```

**Step 4: Run test to verify it passes**

Run: `npm test --workspace=server -- --reporter=verbose src/services/claude.test.ts`
Expected: PASS

**Step 5: Commit**

`git add server/src/services/claude.ts server/src/services/claude.test.ts`
`git commit -m "feat(cal-0ho): ClaudeService with runAgentLoop end_turn path"`

---

## Task 3: Agent loop — tool use path

**Depends on:** Task 2
**Complexity:** standard
**Files:**
- Modify: `server/src/services/claude.ts`
- Modify: `server/src/services/claude.test.ts`

**Purpose:** Handle the tool_use stop_reason — dispatch tool calls, feed results back as tool_result messages, and continue the loop.

**Step 1: Write the failing test**

Append to the `ClaudeService.runAgentLoop` describe block:

```typescript
  it('dispatches tool calls and feeds results back to Claude', async () => {
    const toolUseResponse = {
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'Let me check your calendar.' },
        {
          type: 'tool_use',
          id: 'call_1',
          name: 'get_events',
          input: { start: '2026-03-25T00:00:00Z', end: '2026-03-25T23:59:59Z' },
        },
      ],
    };
    const finalResponse = {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'You have a meeting at 2pm.' }],
    };

    const client = mockAnthropicClient(toolUseResponse);
    (client.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(toolUseResponse).mockResolvedValueOnce(finalResponse);

    const calService = mockCalendarService();
    (calService.getEvents as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'e1', title: 'Meeting', start: '2026-03-25T14:00:00Z', end: '2026-03-25T15:00:00Z', allDay: false },
    ]);

    const service = new ClaudeService(client);
    const result = await service.runAgentLoop(
      [{ role: 'user', content: 'What do I have today?' }],
      calService,
      CTX,
    );

    expect(result).toBe('You have a meeting at 2pm.');
    expect(calService.getEvents).toHaveBeenCalled();
    expect(client.messages.create).toHaveBeenCalledTimes(2);

    // Verify the second call includes tool_result
    const secondCall = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[1][0];
    const lastMessage = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(lastMessage.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool_result', tool_use_id: 'call_1' }),
      ]),
    );
  });
```

**Step 2: Run test to verify it fails**

Run: `npm test --workspace=server -- --reporter=verbose src/services/claude.test.ts`
Expected: FAIL (tool_use stop_reason throws)

**Step 3: Write minimal implementation**

Replace the `throw new Error(...)` in the loop with tool-use handling:

```typescript
      // After the end_turn check, replace the throw with:
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) {
        // stop_reason is max_tokens or pause_turn but no tool calls — continue
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: 'Please continue.' });
        continue;
      }

      // Dispatch all tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (block) => {
          try {
            const result = await dispatchTool(
              block.name as ToolName,
              block.input as Record<string, unknown>,
              calendarService,
            );
            return { type: 'tool_result' as const, tool_use_id: block.id, content: result };
          } catch (err) {
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: `Error: ${err instanceof Error ? err.message : String(err)}`,
              is_error: true,
            };
          }
        }),
      );

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
```

**Step 4: Run test to verify it passes**

Run: `npm test --workspace=server -- --reporter=verbose src/services/claude.test.ts`
Expected: PASS

**Step 5: Commit**

`git add server/src/services/claude.ts server/src/services/claude.test.ts`
`git commit -m "feat(cal-0ho): tool-use dispatch loop with result feeding"`

---

## Task 4: Agent loop — error handling and max iterations

**Depends on:** Task 3
**Complexity:** simple
**Files:**
- Modify: `server/src/services/claude.ts`
- Modify: `server/src/services/claude.test.ts`

**Purpose:** Test the max-iteration guard, tool dispatch errors (fed back as is_error), and the max_context_window_exceeded stop reason.

**Step 1: Write the failing tests**

Append to the `ClaudeService.runAgentLoop` describe block:

```typescript
  it('returns error message when max iterations exceeded', async () => {
    // Create a client that always returns tool_use
    const toolUseResponse = {
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'call_n', name: 'get_events', input: { start: '2026-03-25T00:00:00Z', end: '2026-03-25T23:59:59Z' } },
      ],
    };
    const client = mockAnthropicClient(toolUseResponse);
    const calService = mockCalendarService();
    (calService.getEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const service = new ClaudeService(client);
    const result = await service.runAgentLoop(
      [{ role: 'user', content: 'Do something complex' }],
      calService,
      CTX,
    );

    expect(result).toContain('too many tool calls');
    expect(client.messages.create).toHaveBeenCalledTimes(10);
  });

  it('feeds tool dispatch errors back to Claude as is_error', async () => {
    const toolUseResponse = {
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'call_err', name: 'get_events', input: { start: 'not-a-date', end: '2026-03-25T23:59:59Z' } },
      ],
    };
    const finalResponse = {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Sorry, I had trouble reading your calendar.' }],
    };
    const client = mockAnthropicClient(toolUseResponse);
    (client.messages.create as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(finalResponse);

    const calService = mockCalendarService();
    (calService.getEvents as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid date'));

    const service = new ClaudeService(client);
    const result = await service.runAgentLoop(
      [{ role: 'user', content: 'Show my events' }],
      calService,
      CTX,
    );

    expect(result).toBe('Sorry, I had trouble reading your calendar.');
    // Verify error was passed back
    const secondCall = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[1][0];
    const lastMessage = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMessage.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ is_error: true, tool_use_id: 'call_err' }),
      ]),
    );
  });

  it('throws on max_context_window_exceeded', async () => {
    const client = mockAnthropicClient({
      stop_reason: 'max_context_window_exceeded',
      content: [],
    });
    const service = new ClaudeService(client);

    await expect(
      service.runAgentLoop(
        [{ role: 'user', content: 'Long conversation' }],
        mockCalendarService(),
        CTX,
      ),
    ).rejects.toThrow('Context window exceeded');
  });
```

**Step 2: Run tests to verify failure patterns**

Run: `npm test --workspace=server -- --reporter=verbose src/services/claude.test.ts`
Expected: Some tests may already pass (max iterations, error feeding) based on Task 3 implementation. The `max_context_window_exceeded` test should fail.

**Step 3: Write minimal implementation**

Add context window handling after the `end_turn` check in the loop:

```typescript
      if (response.stop_reason === 'max_context_window_exceeded') {
        throw new Error('Context window exceeded — conversation is too long');
      }
```

**Step 4: Run test to verify all pass**

Run: `npm test --workspace=server -- --reporter=verbose src/services/claude.test.ts`
Expected: PASS (all tests)

**Step 5: Run full test suite and type check**

Run: `npm test --workspace=server`
Expected: All tests pass (existing + new).

Run: `npx tsc --noEmit --project server/tsconfig.json`
Expected: Only the pre-existing `googleCalendar.factory.test.ts` top-level await error — no new errors.

Verify `claude.ts` exports: `ClaudeService`, `buildSystemPrompt`, `UserContext`.

**Step 6: Commit**

`git add server/src/services/claude.ts server/src/services/claude.test.ts`
`git commit -m "feat(cal-0ho): max iterations guard, error feeding, context window handling"`

---

## Verification Record

| Pass | Verdict | Notes |
|------|---------|-------|
| Verification Checklist | PASS | 9/9 items pass |
| Draft | WARN | Fixed: imports consolidated in Task 1; Task 5 merged into Task 3; Task 6 merged into Task 4 |
| Feasibility | WARN | Fixed: duplicate import issue resolved by consolidation; SDK types verified against ^0.80.0 |
| Completeness | PASS | All 6 requirements traced to tasks |
| Risk | WARN | Fixed: defensive copy of messages array added. Noted: max_tokens=1024 may truncate long responses (acceptable for v1) |
| Optimality | WARN | Fixed: merged Tasks 5/6 into 3/4; reduced from 6 tasks to 4 |

Also add the multiple-tool-calls test (regression coverage for `Promise.all`):

```typescript
  it('handles multiple tool calls in a single response', async () => {
    const toolUseResponse = {
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use', id: 'call_a', name: 'get_events',
          input: { start: '2026-03-25T00:00:00Z', end: '2026-03-25T23:59:59Z' },
        },
        {
          type: 'tool_use', id: 'call_b', name: 'get_freebusy',
          input: { emails: ['alice@example.com'], start: '2026-03-25T00:00:00Z', end: '2026-03-25T23:59:59Z' },
        },
      ],
    };
    const finalResponse = {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Here is your schedule and availability.' }],
    };

    const client = mockAnthropicClient(toolUseResponse);
    (client.messages.create as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(finalResponse);

    const calService = mockCalendarService();
    (calService.getEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (calService.getFreeBusy as ReturnType<typeof vi.fn>).mockResolvedValue({
      'alice@example.com': { accessible: true, status: 'ok', busy: [] },
    });

    const service = new ClaudeService(client);
    const result = await service.runAgentLoop(
      [{ role: 'user', content: 'What does my day look like?' }],
      calService,
      CTX,
    );

    expect(result).toBe('Here is your schedule and availability.');
    // Verify both tool results were sent back (Promise.all preserves order)
    const secondCall = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[1][0];
    const lastMessage = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMessage.content).toHaveLength(2);
    expect(lastMessage.content[0]).toMatchObject({ tool_use_id: 'call_a' });
    expect(lastMessage.content[1]).toMatchObject({ tool_use_id: 'call_b' });
  });
```

**Step 5: Commit**

`git add server/src/services/claude.ts server/src/services/claude.test.ts`
`git commit -m "feat(cal-0ho): tool-use dispatch loop with result feeding"`

---

## Task 4: Agent loop — error handling, max iterations, and final verification

**Depends on:** Task 3
**Complexity:** simple
**Files:**
- Modify: `server/src/services/claude.ts`
- Modify: `server/src/services/claude.test.ts`

**Purpose:** Test the max-iteration guard, tool dispatch errors (fed back as is_error), and the max_context_window_exceeded stop reason. Run full suite and type check to verify everything is clean.

**Not In Scope:** Wiring into `index.ts` or creating routes — that's the chat route task (`cal-01r`).
