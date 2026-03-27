import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, ClaudeService } from './claude';
import type { GoogleCalendarService } from './googleCalendar';
import type { SSEEvent } from './sse';

/** Creates a mock stream that yields events then resolves to finalMessage. */
function mockStream(events: object[], finalMessage: object) {
  const iterator = events[Symbol.iterator]();
  return {
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        const result = iterator.next();
        return result.done ? { done: true, value: undefined } : { done: false, value: result.value };
      },
    }),
    finalMessage: async () => finalMessage,
  };
}

function mockAnthropicClient(streamFn: ReturnType<typeof vi.fn>) {
  return { messages: { stream: streamFn } } as unknown as Anthropic;
}

function mockCalendarService(): GoogleCalendarService {
  return {
    getEvents: vi.fn().mockResolvedValue([]),
    getFreeBusy: vi.fn().mockResolvedValue({}),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
  } as unknown as GoogleCalendarService;
}

function collectEmit(): { events: SSEEvent[]; emit: (e: SSEEvent) => void } {
  const events: SSEEvent[] = [];
  return { events, emit: (e: SSEEvent) => events.push(e) };
}

const CTX = { email: 'alice@example.com', timezone: 'America/New_York', now: new Date('2026-03-25T10:00:00Z') };

describe('buildSystemPrompt', () => {
  it('includes the user email', () => {
    expect(buildSystemPrompt(CTX)).toContain('alice@example.com');
  });

  it('includes the current date', () => {
    expect(buildSystemPrompt(CTX)).toContain('2026-03-25');
  });

  it('includes the timezone', () => {
    expect(buildSystemPrompt(CTX)).toContain('America/New_York');
  });

  it('includes write-confirmation instructions', () => {
    const prompt = buildSystemPrompt(CTX);
    expect(prompt).toMatch(/confirm/i);
  });
});

describe('ClaudeService.streamAgentLoop', () => {
  it('emits delta events and done on text-only response', async () => {
    const streamFn = vi.fn().mockReturnValue(mockStream(
      [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
      ],
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hello world' }] },
    ));
    const { events, emit } = collectEmit();
    const service = new ClaudeService(mockAnthropicClient(streamFn));

    await service.streamAgentLoop(
      [{ role: 'user', content: 'Hi' }],
      mockCalendarService(),
      CTX,
      emit,
    );

    expect(events[0]).toEqual({ event: 'status', data: { type: 'thinking' } });
    expect(events[1]).toEqual({ event: 'delta', data: { text: 'Hello' } });
    expect(events[2]).toEqual({ event: 'delta', data: { text: ' world' } });
    expect(events[events.length - 1]).toEqual({ event: 'done', data: {} });
  });

  it('dispatches read tools and loops back', async () => {
    const streamFn = vi.fn()
      .mockReturnValueOnce(mockStream([], {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'call_1', name: 'get_events', input: { start: '2026-03-25T00:00:00Z', end: '2026-03-25T23:59:59Z' } },
        ],
      }))
      .mockReturnValueOnce(mockStream(
        [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done' } }],
        { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done' }] },
      ));

    const calService = mockCalendarService();
    const { events, emit } = collectEmit();
    const service = new ClaudeService(mockAnthropicClient(streamFn));

    await service.streamAgentLoop(
      [{ role: 'user', content: 'What do I have today?' }],
      calService,
      CTX,
      emit,
    );

    expect(calService.getEvents).toHaveBeenCalled();
    const toolCallEvent = events.find((e) => e.event === 'tool_call');
    expect(toolCallEvent).toEqual({ event: 'tool_call', data: { tool: 'get_events' } });
    const toolResultEvent = events.find((e) => e.event === 'tool_result');
    expect(toolResultEvent?.data).toMatchObject({ tool: 'get_events' });
    expect(streamFn).toHaveBeenCalledTimes(2);
  });

  it('emits event_proposal for propose_event and stops', async () => {
    const streamFn = vi.fn().mockReturnValue(mockStream([], {
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use', id: 'call_p', name: 'propose_event',
          input: { id: '', title: 'Standup', start: '2026-03-26T09:00:00Z', end: '2026-03-26T09:30:00Z', attendees: ['bob@example.com'] },
        },
      ],
    }));

    const { events, emit } = collectEmit();
    const calService = mockCalendarService();
    const service = new ClaudeService(mockAnthropicClient(streamFn));

    await service.streamAgentLoop(
      [{ role: 'user', content: 'Schedule a standup' }],
      calService,
      CTX,
      emit,
    );

    const proposal = events.find((e) => e.event === 'event_proposal');
    expect(proposal).toBeDefined();
    expect(proposal!.data).toMatchObject({
      id: 'call_p',
      action: 'create',
      event: { title: 'Standup', attendees: ['bob@example.com'] },
    });
    expect(events[events.length - 1]).toEqual({ event: 'done', data: {} });
    expect(calService.createEvent).not.toHaveBeenCalled();
    expect(streamFn).toHaveBeenCalledTimes(1);
  });

  it('dispatches create_event directly (not intercepted)', async () => {
    const streamFn = vi.fn()
      .mockReturnValueOnce(mockStream([], {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use', id: 'call_c', name: 'create_event',
            input: { id: '', title: 'Standup', start: '2026-03-26T09:00:00Z', end: '2026-03-26T09:30:00Z' },
          },
        ],
      }))
      .mockReturnValueOnce(mockStream([], {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Created!' }],
      }));

    const calService = mockCalendarService();
    (calService.createEvent as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'new-1', title: 'Standup' });
    const { events, emit } = collectEmit();
    const service = new ClaudeService(mockAnthropicClient(streamFn));

    await service.streamAgentLoop(
      [{ role: 'user', content: 'Yes, create it' }],
      calService,
      CTX,
      emit,
    );

    expect(calService.createEvent).toHaveBeenCalled();
    expect(events.find((e) => e.event === 'event_proposal')).toBeUndefined();
  });

  it('groups multiple propose_event calls', async () => {
    const streamFn = vi.fn().mockReturnValue(mockStream([], {
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'p1', name: 'propose_event', input: { id: '', title: 'Sync', start: '2026-03-26T09:00:00Z', end: '2026-03-26T09:30:00Z' } },
        { type: 'tool_use', id: 'p2', name: 'propose_event', input: { id: '', title: 'Sync', start: '2026-03-26T10:00:00Z', end: '2026-03-26T10:30:00Z' } },
      ],
    }));

    const { events, emit } = collectEmit();
    const service = new ClaudeService(mockAnthropicClient(streamFn));

    await service.streamAgentLoop(
      [{ role: 'user', content: 'Find me a time' }],
      mockCalendarService(),
      CTX,
      emit,
    );

    const proposals = events.filter((e) => e.event === 'event_proposal');
    expect(proposals).toHaveLength(2);
    // Both should share a group
    expect(proposals[0].data.group).toBeDefined();
    expect(proposals[0].data.group).toBe(proposals[1].data.group);
  });

  it('emits tool_result with error on dispatch failure', async () => {
    const streamFn = vi.fn()
      .mockReturnValueOnce(mockStream([], {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'call_err', name: 'get_events', input: { start: '2026-03-25T00:00:00Z', end: '2026-03-25T23:59:59Z' } },
        ],
      }))
      .mockReturnValueOnce(mockStream([], {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Error occurred.' }],
      }));

    const calService = mockCalendarService();
    (calService.getEvents as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API down'));
    const { events, emit } = collectEmit();
    const service = new ClaudeService(mockAnthropicClient(streamFn));

    await service.streamAgentLoop(
      [{ role: 'user', content: 'Show events' }],
      calService,
      CTX,
      emit,
    );

    const errorResult = events.find((e) => e.event === 'tool_result' && e.data.error);
    expect(errorResult).toBeDefined();
    expect(errorResult!.data).toMatchObject({ tool: 'get_events', error: true });
  });

  it('emits error event when max iterations exceeded', async () => {
    const streamFn = vi.fn().mockReturnValue(mockStream([], {
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'call_n', name: 'get_events', input: { start: '2026-03-25T00:00:00Z', end: '2026-03-25T23:59:59Z' } },
      ],
    }));

    const { events, emit } = collectEmit();
    const service = new ClaudeService(mockAnthropicClient(streamFn));

    await service.streamAgentLoop(
      [{ role: 'user', content: 'Loop forever' }],
      mockCalendarService(),
      CTX,
      emit,
    );

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect(streamFn).toHaveBeenCalledTimes(10);
  });

  it('does not mutate the input messages array', async () => {
    const streamFn = vi.fn().mockReturnValue(mockStream([], {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Hi' }],
    }));
    const original = [{ role: 'user' as const, content: 'Hi' }];
    const service = new ClaudeService(mockAnthropicClient(streamFn));

    await service.streamAgentLoop(original, mockCalendarService(), CTX, vi.fn());

    expect(original).toHaveLength(1);
  });
});
