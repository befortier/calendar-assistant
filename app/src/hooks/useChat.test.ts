import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from './useChat';

// Mock streamChat so we can control SSE events
vi.mock('../lib/streamChat', () => ({
  streamChat: vi.fn(),
}));

// Mock the calendar store
vi.mock('../stores/calendar', () => ({
  useCalendarStore: {
    getState: () => ({ calendarId: 'primary', calendarName: null }),
  },
}));

import { streamChat } from '../lib/streamChat';

const mockStreamChat = vi.mocked(streamChat);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useChat', () => {
  describe('sendMessage', () => {
    it('appends a user message and starts streaming', async () => {
      mockStreamChat.mockResolvedValue(undefined);
      const { result } = renderHook(() => useChat());

      await act(() => result.current.sendMessage('hello'));

      const messages = result.current.items.filter(
        (i) => i.type === 'message',
      );
      // User message + empty assistant placeholder
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ role: 'user', content: 'hello' });
      expect(messages[1]).toMatchObject({ role: 'assistant', content: '' });
    });

    it('sets loading true during streaming and false after done', async () => {
      let onEvent!: (e: any) => void;
      mockStreamChat.mockImplementation(async (_msgs, _tz, _cid, _cn, cb) => {
        onEvent = cb;
        // Hold open — we'll emit 'done' manually
        await new Promise<void>((resolve) => {
          // Store resolve so we can complete after emitting done
          setTimeout(() => resolve(), 500);
        });
      });

      const { result } = renderHook(() => useChat());
      act(() => {
        void result.current.sendMessage('hi');
      });

      await waitFor(() => expect(result.current.loading).toBe(true));

      await act(async () => {
        onEvent({ event: 'done', data: {} });
      });
      expect(result.current.loading).toBe(false);
    });

    it('sets error when streamChat throws', async () => {
      mockStreamChat.mockRejectedValue(new Error('network'));
      const { result } = renderHook(() => useChat());

      await act(() => result.current.sendMessage('hi'));

      expect(result.current.error).toBe('Connection lost. Please try again.');
      expect(result.current.loading).toBe(false);
    });
  });

  describe('SSE event handling', () => {
    it('appends delta text to the last assistant message', async () => {
      mockStreamChat.mockImplementation(async (_msgs, _tz, _cid, _cn, onEvent) => {
        onEvent({ event: 'delta', data: { text: 'Hello ' } });
        onEvent({ event: 'delta', data: { text: 'world' } });
        onEvent({ event: 'done', data: {} });
      });

      const { result } = renderHook(() => useChat());
      await act(() => result.current.sendMessage('hi'));

      const assistant = result.current.items.find(
        (i) => i.type === 'message' && i.role === 'assistant',
      );
      expect(assistant?.type === 'message' && assistant.content).toBe('Hello world');
    });

    it('sets status on tool_call and clears on tool_result', async () => {
      let onEvent!: (e: Parameters<typeof streamChat>[4] extends (e: infer E) => void ? E : never) => void;
      mockStreamChat.mockImplementation(async (_msgs, _tz, _cid, _cn, cb) => {
        onEvent = cb;
        // Don't resolve — let us control events manually
        await new Promise(() => {});
      });

      const { result } = renderHook(() => useChat());
      act(() => {
        void result.current.sendMessage('hi');
      });

      await waitFor(() => expect(result.current.loading).toBe(true));

      act(() => onEvent({ event: 'tool_call', data: { tool: 'get_events' } }));
      expect(result.current.status).toBe('Using get events…');

      act(() => onEvent({ event: 'tool_result', data: { tool: 'get_events', summary: 'ok' } }));
      expect(result.current.status).toBeNull();
    });

    it('adds a proposal item on event_proposal', async () => {
      const proposalEvent = {
        id: 'p-1',
        action: 'create' as const,
        event: { id: 'evt-1', title: 'Meeting', start: '2026-04-01T10:00:00Z', end: '2026-04-01T11:00:00Z', allDay: false },
      };

      mockStreamChat.mockImplementation(async (_msgs, _tz, _cid, _cn, onEvent) => {
        onEvent({ event: 'event_proposal', data: proposalEvent });
        onEvent({ event: 'done', data: {} });
      });

      const { result } = renderHook(() => useChat());
      await act(() => result.current.sendMessage('create a meeting'));

      const proposal = result.current.items.find((i) => i.type === 'event_proposal');
      expect(proposal).toMatchObject({
        type: 'event_proposal',
        id: 'p-1',
        action: 'create',
        status: 'pending',
      });
    });

    it('adds a batch proposal on batch_proposal', async () => {
      const batchEvent = {
        batchId: 'b-1',
        entries: [
          { id: 'tc-1', action: 'delete' as const, event: { id: 'evt-1', title: 'Standup', start: '2026-04-01T09:00:00Z', end: '2026-04-01T09:30:00Z', allDay: false } },
          { id: 'tc-2', action: 'delete' as const, event: { id: 'evt-2', title: 'Retro', start: '2026-04-01T14:00:00Z', end: '2026-04-01T15:00:00Z', allDay: false } },
        ],
      };

      mockStreamChat.mockImplementation(async (_msgs, _tz, _cid, _cn, onEvent) => {
        onEvent({ event: 'batch_proposal', data: batchEvent });
        onEvent({ event: 'done', data: {} });
      });

      const { result } = renderHook(() => useChat());
      await act(() => result.current.sendMessage('delete my meetings'));

      const batch = result.current.items.find((i) => i.type === 'batch_proposal');
      expect(batch).toMatchObject({
        type: 'batch_proposal',
        id: 'b-1',
        status: 'pending',
        removedIds: [],
      });
      if (batch?.type === 'batch_proposal') {
        expect(batch.entries).toHaveLength(2);
      }
    });

    it('handles error SSE event', async () => {
      mockStreamChat.mockImplementation(async (_msgs, _tz, _cid, _cn, onEvent) => {
        onEvent({ event: 'error', data: { message: 'something broke' } });
        onEvent({ event: 'done', data: {} });
      });

      const { result } = renderHook(() => useChat());
      await act(() => result.current.sendMessage('hi'));

      expect(result.current.error).toBe('something broke');
    });
  });

  describe('removeFromBatch', () => {
    it('adds eventId to the batch removedIds', async () => {
      mockStreamChat.mockImplementation(async (_msgs, _tz, _cid, _cn, onEvent) => {
        onEvent({
          event: 'batch_proposal',
          data: {
            batchId: 'b-1',
            entries: [
              { id: 'tc-1', action: 'delete' as const, event: { id: 'evt-1', title: 'Standup', start: '2026-04-01T09:00:00Z', end: '2026-04-01T09:30:00Z', allDay: false } },
              { id: 'tc-2', action: 'delete' as const, event: { id: 'evt-2', title: 'Retro', start: '2026-04-01T14:00:00Z', end: '2026-04-01T15:00:00Z', allDay: false } },
            ],
          },
        });
        onEvent({ event: 'done', data: {} });
      });

      const { result } = renderHook(() => useChat());
      await act(() => result.current.sendMessage('delete meetings'));

      act(() => result.current.removeFromBatch('b-1', 'evt-1'));

      const batch = result.current.items.find(
        (i) => i.type === 'batch_proposal' && i.id === 'b-1',
      );
      if (batch?.type === 'batch_proposal') {
        expect(batch.removedIds).toContain('evt-1');
        expect(batch.removedIds).not.toContain('evt-2');
      }
    });
  });

  describe('respondToProposal', () => {
    async function setupWithProposal() {
      mockStreamChat
        .mockImplementationOnce(async (_msgs, _tz, _cid, _cn, onEvent) => {
          onEvent({
            event: 'event_proposal',
            data: {
              id: 'p-1',
              action: 'create' as const,
              event: { id: 'evt-1', title: 'Meeting', start: '2026-04-01T10:00:00Z', end: '2026-04-01T11:00:00Z', allDay: false },
            },
          });
          onEvent({ event: 'done', data: {} });
        })
        .mockResolvedValue(undefined); // second call for the confirmation stream

      const hook = renderHook(() => useChat());
      await act(() => hook.result.current.sendMessage('create a meeting'));
      return hook;
    }

    it('marks proposal accepted and sends confirmation stream', async () => {
      const { result } = await setupWithProposal();

      await act(() => result.current.respondToProposal('p-1', true));

      const proposal = result.current.items.find(
        (i) => i.type === 'event_proposal' && i.id === 'p-1',
      );
      expect(proposal?.type === 'event_proposal' && proposal.status).toBe('accepted');
      // streamChat called twice: once for initial message, once for confirmation
      expect(mockStreamChat).toHaveBeenCalledTimes(2);
    });

    it('removes proposal on decline and sends cancel stream', async () => {
      const { result } = await setupWithProposal();

      await act(() => result.current.respondToProposal('p-1', false));

      const proposal = result.current.items.find(
        (i) => i.type === 'event_proposal' && i.id === 'p-1',
      );
      expect(proposal).toBeUndefined();
      // streamChat called twice: once for initial message, once for cancel
      expect(mockStreamChat).toHaveBeenCalledTimes(2);
    });
  });

  describe('respondToBatch', () => {
    async function setupWithBatch() {
      mockStreamChat
        .mockImplementationOnce(async (_msgs, _tz, _cid, _cn, onEvent) => {
          onEvent({
            event: 'batch_proposal',
            data: {
              batchId: 'b-1',
              entries: [
                { id: 'tc-1', action: 'delete' as const, event: { id: 'evt-1', title: 'Standup', start: '2026-04-01T09:00:00Z', end: '2026-04-01T09:30:00Z', allDay: false } },
                { id: 'tc-2', action: 'delete' as const, event: { id: 'evt-2', title: 'Retro', start: '2026-04-01T14:00:00Z', end: '2026-04-01T15:00:00Z', allDay: false } },
              ],
            },
          });
          onEvent({ event: 'done', data: {} });
        })
        .mockResolvedValue(undefined);

      const hook = renderHook(() => useChat());
      await act(() => hook.result.current.sendMessage('delete meetings'));
      return hook;
    }

    it('marks batch accepted and sends confirmation stream', async () => {
      const { result } = await setupWithBatch();

      await act(() => result.current.respondToBatch('b-1', true));

      const batch = result.current.items.find(
        (i) => i.type === 'batch_proposal' && i.id === 'b-1',
      );
      expect(batch?.type === 'batch_proposal' && batch.status).toBe('accepted');
      expect(mockStreamChat).toHaveBeenCalledTimes(2);
    });

    it('removes batch on decline and sends cancel stream', async () => {
      const { result } = await setupWithBatch();

      await act(() => result.current.respondToBatch('b-1', false));

      const batch = result.current.items.find(
        (i) => i.type === 'batch_proposal' && i.id === 'b-1',
      );
      expect(batch).toBeUndefined();
      expect(mockStreamChat).toHaveBeenCalledTimes(2);
    });

    it('excludes removed events from the accepted batch confirmation', async () => {
      const { result } = await setupWithBatch();

      act(() => result.current.removeFromBatch('b-1', 'evt-1'));
      await act(() => result.current.respondToBatch('b-1', true));

      // The confirmation message should reference only 1 event
      const confirmMsg = result.current.items.find(
        (i) => i.type === 'message' && i.role === 'user' && i.content.includes('delete'),
      );
      expect(confirmMsg).toBeDefined();

      // The second streamChat call's messages should include the confirmation
      const secondCall = mockStreamChat.mock.calls[1];
      const messages = secondCall[0];
      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.content).toContain('delete');
    });
  });

  describe('clearChat', () => {
    it('resets all state', async () => {
      mockStreamChat.mockResolvedValue(undefined);
      const { result } = renderHook(() => useChat());
      await act(() => result.current.sendMessage('hi'));

      act(() => result.current.clearChat());

      expect(result.current.items).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.status).toBeNull();
    });
  });
});
