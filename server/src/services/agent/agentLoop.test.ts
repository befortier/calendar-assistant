import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop, type AgentLoopDeps } from './agentLoop';
import type { LLMProvider, StreamResult, ChatMessage, ToolDefinition } from './types';
import { StopReason } from './types';
import { SSEEventType, type SSEEvent, type SSEEmitter } from '../sse';
import { makeCalendarToolDispatcher } from '../tools/calendar/dispatcher';
import type { GoogleCalendarService } from '../tools/calendar/google';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockProvider(results: StreamResult[]): LLMProvider {
  let call = 0;
  return {
    stream: vi.fn(async (_sys, _msgs, _tools, onDelta) => {
      const result = results[call++];
      if (result.text) onDelta(result.text);
      return result;
    }),
  };
}

const DUMMY_TOOLS: ToolDefinition[] = [
  {
    name: 'get_events',
    description: 'Get events',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

function makeDeps(overrides: Partial<AgentLoopDeps> = {}): AgentLoopDeps {
  return {
    provider: mockProvider([{ stopReason: StopReason.EndTurn, text: '', toolCalls: [] }]),
    tools: DUMMY_TOOLS,
    dispatchTool: vi.fn().mockResolvedValue('ok'),
    buildSystemPrompt: () => 'You are a calendar assistant.',
    ...overrides,
  };
}

function collectEvents(events: SSEEvent[]): SSEEmitter {
  return (event) => events.push(event);
}

/** Build a dispatchTool that routes proposal tools through the dispatcher (with emit), and other tools through a mock. */
function makeDispatchToolWithEmitter(
  emit: SSEEmitter,
  otherDispatch: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue('ok'),
): { dispatchTool: (name: string, input: Record<string, unknown>) => Promise<string>; otherDispatch: ReturnType<typeof vi.fn> } {
  const stubService = {} as GoogleCalendarService;
  const dispatcher = makeCalendarToolDispatcher(stubService, emit);
  const dispatchTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
    if (name === 'propose_event' || name === 'propose_batched_events') {
      return dispatcher.dispatch(name, input);
    }
    return otherDispatch(name, input);
  };
  return { dispatchTool, otherDispatch };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runAgentLoop', () => {
  // a. Text-only response
  it('emits status, delta, and done for a text-only response', async () => {
    const provider = mockProvider([
      { stopReason: StopReason.EndTurn, text: 'Hello', toolCalls: [] },
    ]);
    const deps = makeDeps({ provider });
    const events: SSEEvent[] = [];

    await runAgentLoop(
      [{ role: 'user', content: 'Hi' }],
      deps,
      collectEvents(events),
    );

    expect(events[0]).toEqual({ event: SSEEventType.Status, data: { type: 'thinking' } });
    expect(events).toContainEqual({ event: SSEEventType.Delta, data: { text: 'Hello' } });
    expect(events[events.length - 1]).toEqual({ event: SSEEventType.Done, data: {} });
  });

  // b. Tool dispatch + loop
  it('dispatches tools and loops back to provider', async () => {
    const toolCall = { id: 'tc-1', name: 'get_events', input: { start: 'a', end: 'b' } };
    const provider = mockProvider([
      { stopReason: StopReason.ToolUse, text: '', toolCalls: [toolCall] },
      { stopReason: StopReason.EndTurn, text: 'Here are your events.', toolCalls: [] },
    ]);
    const dispatchTool = vi.fn().mockResolvedValue('[]');
    const deps = makeDeps({ provider, dispatchTool });
    const events: SSEEvent[] = [];

    await runAgentLoop(
      [{ role: 'user', content: 'Show events' }],
      deps,
      collectEvents(events),
    );

    expect(dispatchTool).toHaveBeenCalledWith('get_events', { start: 'a', end: 'b' });
    expect(events).toContainEqual({ event: SSEEventType.ToolCall, data: { tool: 'get_events' } });
    expect(events).toContainEqual({
      event: SSEEventType.ToolResult,
      data: { tool: 'get_events', summary: 'Completed' },
    });
    expect(provider.stream).toHaveBeenCalledTimes(2);
  });

  // c. Proposals — now dispatched immediately via dispatchTool (which holds a reference to the emitter)
  it('emits event_proposal immediately and does NOT call the underlying Google service', async () => {
    const proposal = {
      id: 'tc-p1',
      name: 'propose_event',
      input: {
        title: 'Lunch',
        start: '2026-03-22T12:00:00Z',
        end: '2026-03-22T13:00:00Z',
      },
    };
    const provider = mockProvider([
      { stopReason: StopReason.ToolUse, text: '', toolCalls: [proposal] },
      { stopReason: StopReason.EndTurn, text: '', toolCalls: [] },
    ]);
    const events: SSEEvent[] = [];
    const emit = collectEvents(events);
    const { dispatchTool, otherDispatch } = makeDispatchToolWithEmitter(emit);
    const deps = makeDeps({ provider, dispatchTool });

    await runAgentLoop(
      [{ role: 'user', content: 'Schedule lunch' }],
      deps,
      emit,
    );

    const proposalEvents = events.filter((e) => e.event === SSEEventType.EventProposal);
    expect(proposalEvents).toHaveLength(1);
    expect(proposalEvents[0].data).toMatchObject({
      action: 'create',
      event: { title: 'Lunch', start: '2026-03-22T12:00:00Z', end: '2026-03-22T13:00:00Z' },
    });
    expect(events[events.length - 1]).toEqual({ event: SSEEventType.Done, data: {} });
    expect(otherDispatch).not.toHaveBeenCalled();
    expect(provider.stream).toHaveBeenCalledTimes(2);
  });

  // d. Multiple propose_event calls (alternatives) emit individual event_proposal events, never batched
  it('emits individual event_proposal for each propose_event call (alternatives scenario)', async () => {
    const proposals = [
      {
        id: 'tc-p1',
        name: 'propose_event',
        input: { action: 'create', title: 'Option 1', start: 'a', end: 'b' },
      },
      {
        id: 'tc-p2',
        name: 'propose_event',
        input: { action: 'create', title: 'Option 2', start: 'c', end: 'd' },
      },
    ];
    const provider = mockProvider([
      { stopReason: StopReason.ToolUse, text: '', toolCalls: proposals },
      { stopReason: StopReason.EndTurn, text: 'Pick one!', toolCalls: [] },
    ]);
    const events: SSEEvent[] = [];
    const emit = collectEvents(events);
    const { dispatchTool } = makeDispatchToolWithEmitter(emit);
    const deps = makeDeps({ provider, dispatchTool });

    await runAgentLoop(
      [{ role: 'user', content: 'Find me a time' }],
      deps,
      emit,
    );

    const proposalEvents = events.filter((e) => e.event === SSEEventType.EventProposal);
    expect(proposalEvents).toHaveLength(2);
    expect(proposalEvents[0].data).toMatchObject({ event: { title: 'Option 1' } });
    expect(proposalEvents[1].data).toMatchObject({ event: { title: 'Option 2' } });
    expect(events.filter((e) => e.event === SSEEventType.BatchProposal)).toHaveLength(0);
  });

  // d2. propose_event calls across iterations also stay individual
  it('emits individual event_proposal for propose_event calls spread across iterations', async () => {
    const provider = mockProvider([
      { stopReason: StopReason.ToolUse, text: 'Option 1:', toolCalls: [
        { id: 'p1', name: 'propose_event', input: { action: 'create', title: 'Sync', start: '2026-03-30T09:00:00Z', end: '2026-03-30T09:30:00Z' } },
      ]},
      { stopReason: StopReason.ToolUse, text: 'Option 2:', toolCalls: [
        { id: 'p2', name: 'propose_event', input: { action: 'create', title: 'Sync', start: '2026-03-30T10:00:00Z', end: '2026-03-30T10:30:00Z' } },
      ]},
      { stopReason: StopReason.ToolUse, text: 'Option 3:', toolCalls: [
        { id: 'p3', name: 'propose_event', input: { action: 'create', title: 'Sync', start: '2026-03-30T11:00:00Z', end: '2026-03-30T11:30:00Z' } },
      ]},
      { stopReason: StopReason.EndTurn, text: 'Pick one!', toolCalls: [] },
    ]);
    const events: SSEEvent[] = [];
    const emit = collectEvents(events);
    const { dispatchTool, otherDispatch } = makeDispatchToolWithEmitter(emit);
    const deps = makeDeps({ provider, dispatchTool });

    await runAgentLoop(
      [{ role: 'user', content: 'Give me 3 options' }],
      deps,
      emit,
    );

    const proposalEvents = events.filter((e) => e.event === SSEEventType.EventProposal);
    expect(proposalEvents).toHaveLength(3);
    expect(events.filter((e) => e.event === SSEEventType.BatchProposal)).toHaveLength(0);
    expect(otherDispatch).not.toHaveBeenCalled();
    expect(provider.stream).toHaveBeenCalledTimes(4);
  });

  // d3. propose_batched_events emits a single batch_proposal
  it('emits a single batch_proposal for propose_batched_events', async () => {
    const batchCall = {
      id: 'tc-b1',
      name: 'propose_batched_events',
      input: {
        events: [
          { action: 'create', id: '', title: 'Standup', start: '2026-03-31T09:00:00Z', end: '2026-03-31T09:30:00Z', attendees: [] },
          { action: 'create', id: '', title: 'Standup', start: '2026-04-02T09:00:00Z', end: '2026-04-02T09:30:00Z', attendees: [] },
          { action: 'create', id: '', title: 'Standup', start: '2026-04-04T09:00:00Z', end: '2026-04-04T09:30:00Z', attendees: [] },
        ],
      },
    };
    const provider = mockProvider([
      { stopReason: StopReason.ToolUse, text: '', toolCalls: [batchCall] },
      { stopReason: StopReason.EndTurn, text: '', toolCalls: [] },
    ]);
    const events: SSEEvent[] = [];
    const emit = collectEvents(events);
    const { dispatchTool } = makeDispatchToolWithEmitter(emit);
    const deps = makeDeps({ provider, dispatchTool });

    await runAgentLoop(
      [{ role: 'user', content: 'Schedule standup M/W/F' }],
      deps,
      emit,
    );

    const batchEvents = events.filter((e) => e.event === SSEEventType.BatchProposal);
    expect(batchEvents).toHaveLength(1);
    const batchData = batchEvents[0].data as { batchId: string; entries: unknown[] };
    expect(batchData.batchId).toBeDefined();
    expect(batchData.entries).toHaveLength(3);
    expect(events.filter((e) => e.event === SSEEventType.EventProposal)).toHaveLength(0);
  });

  // e. Tool dispatch error
  it('emits error tool_result and continues loop when dispatchTool throws', async () => {
    const toolCall = { id: 'tc-err', name: 'get_events', input: {} };
    const provider = mockProvider([
      { stopReason: StopReason.ToolUse, text: '', toolCalls: [toolCall] },
      { stopReason: StopReason.EndTurn, text: 'Sorry about that.', toolCalls: [] },
    ]);
    const dispatchTool = vi.fn().mockRejectedValue(new Error('Calendar API failed'));
    const deps = makeDeps({ provider, dispatchTool });
    const events: SSEEvent[] = [];

    await runAgentLoop(
      [{ role: 'user', content: 'Show events' }],
      deps,
      collectEvents(events),
    );

    expect(events).toContainEqual({
      event: SSEEventType.ToolResult,
      data: { tool: 'get_events', summary: 'Calendar API failed', error: true },
    });
    // Loop continued — provider called a second time
    expect(provider.stream).toHaveBeenCalledTimes(2);
  });

  // f. Max iterations
  it('emits error after exceeding max iterations', async () => {
    const infiniteToolCall = { id: 'tc-loop', name: 'get_events', input: {} };
    const results: StreamResult[] = Array.from({ length: 11 }, () => ({
      stopReason: StopReason.ToolUse,
      text: '',
      toolCalls: [infiniteToolCall],
    }));
    const provider = mockProvider(results);
    const deps = makeDeps({ provider });
    const events: SSEEvent[] = [];

    await runAgentLoop(
      [{ role: 'user', content: 'Loop forever' }],
      deps,
      collectEvents(events),
    );

    const errorEvents = events.filter((e) => e.event === SSEEventType.Error);
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0].data as { message: string }).message).toContain('Too many tool calls');
    expect(provider.stream).toHaveBeenCalledTimes(10);
  });

  // g. Doesn't mutate input messages
  it('does not mutate the original input messages array', async () => {
    const toolCall = { id: 'tc-1', name: 'get_events', input: {} };
    const provider = mockProvider([
      { stopReason: StopReason.ToolUse, text: '', toolCalls: [toolCall] },
      { stopReason: StopReason.EndTurn, text: 'Done', toolCalls: [] },
    ]);
    const deps = makeDeps({ provider });
    const events: SSEEvent[] = [];
    const inputMessages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
    const originalLength = inputMessages.length;

    await runAgentLoop(inputMessages, deps, collectEvents(events));

    expect(inputMessages).toHaveLength(originalLength);
  });
});
