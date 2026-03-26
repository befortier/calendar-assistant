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
    const prompt = buildSystemPrompt(CTX);
    expect(prompt).toContain('alice@example.com');
  });

  it('includes the current date', () => {
    const prompt = buildSystemPrompt(CTX);
    expect(prompt).toContain('2026-03-25');
  });

  it('includes the timezone', () => {
    const prompt = buildSystemPrompt(CTX);
    expect(prompt).toContain('America/New_York');
  });

  it('includes write-confirmation instructions', () => {
    const prompt = buildSystemPrompt(CTX);
    expect(prompt).toMatch(/confirm/i);
    expect(prompt).toMatch(/create_event|update_event|delete_event/);
  });
});

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
    (client.messages.create as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(finalResponse);

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

  it('returns error message when max iterations exceeded', async () => {
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

  it('does not mutate the input messages array', async () => {
    const client = mockAnthropicClient({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Hello' }],
    });
    const service = new ClaudeService(client);
    const original = [{ role: 'user' as const, content: 'Hi' }];

    await service.runAgentLoop(original, mockCalendarService(), CTX);

    expect(original).toHaveLength(1);
  });
});
