import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamChat } from './streamChat';
import type { SSEEvent } from './sse';

// Mock auth store
vi.mock('../stores/auth', () => ({
  useAuthStore: {
    getState: vi.fn(),
  },
}));

import { useAuthStore } from '../stores/auth';

const mockGetState = vi.mocked(useAuthStore.getState);
const mockLogout = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockGetState.mockReturnValue({ token: 'test-token', login: vi.fn(), logout: mockLogout });
  vi.stubGlobal('fetch', vi.fn());
});

function makeStreamResponse(chunks: string[]): Response {
  let idx = 0;
  const reader = {
    read: vi.fn(async () => {
      if (idx < chunks.length) {
        const chunk = new TextEncoder().encode(chunks[idx++]);
        return { done: false, value: chunk };
      }
      return { done: true, value: undefined };
    }),
  };
  return {
    ok: true,
    status: 200,
    body: { getReader: () => reader },
  } as unknown as Response;
}

describe('streamChat', () => {
  const msgs: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: 'hi' }];
  const tz = 'America/New_York';
  const calId = 'primary';

  it('calls logout and returns early when no token', async () => {
    mockGetState.mockReturnValue({ token: null, login: vi.fn(), logout: mockLogout });
    const onEvent = vi.fn();

    await streamChat(msgs, tz, calId, undefined, onEvent);

    expect(mockLogout).toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('calls logout on 401 response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401, body: null } as Response);
    const onEvent = vi.fn();

    await streamChat(msgs, tz, calId, undefined, onEvent);

    expect(mockLogout).toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('emits error event on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, body: null } as Response);
    const onEvent = vi.fn();

    await streamChat(msgs, tz, calId, undefined, onEvent);

    expect(onEvent).toHaveBeenCalledWith({ event: 'error', data: { message: 'Failed to connect to chat' } });
    expect(onEvent).toHaveBeenCalledWith({ event: 'done', data: {} });
  });

  it('streams and parses SSE events', async () => {
    const chunk = 'event: delta\ndata: {"text":"hello"}\n\nevent: done\ndata: {}\n\n';
    vi.mocked(fetch).mockResolvedValue(makeStreamResponse([chunk]));

    const events: SSEEvent[] = [];
    await streamChat(msgs, tz, calId, undefined, (e) => events.push(e));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: 'delta', data: { text: 'hello' } });
    expect(events[1]).toEqual({ event: 'done', data: {} });
  });

  it('handles chunked data across multiple reads', async () => {
    const chunk1 = 'event: delta\ndata: {"text":"a"}\n\nevent: del';
    const chunk2 = 'ta\ndata: {"text":"b"}\n\n';
    vi.mocked(fetch).mockResolvedValue(makeStreamResponse([chunk1, chunk2]));

    const events: SSEEvent[] = [];
    await streamChat(msgs, tz, calId, undefined, (e) => events.push(e));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: 'delta', data: { text: 'a' } });
    expect(events[1]).toEqual({ event: 'delta', data: { text: 'b' } });
  });

  it('sends correct headers and body', async () => {
    vi.mocked(fetch).mockResolvedValue(makeStreamResponse([]));
    const onEvent = vi.fn();

    await streamChat(
      [{ role: 'user', content: 'hi' }],
      'America/New_York',
      'cal-123',
      'My Calendar',
      onEvent,
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/chat'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'hi' }],
          timezone: 'America/New_York',
          calendarId: 'cal-123',
          calendarName: 'My Calendar',
        }),
      }),
    );
  });
});
