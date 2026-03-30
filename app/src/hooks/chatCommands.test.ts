import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatCommands, type ChatCommandDeps } from './chatCommands';
import type { ChatItem, ProposalItem, BatchProposalItem } from '../types/chat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(items: ChatItem[] = []): ChatCommandDeps & {
  dispatched: unknown[];
  streamedWith: ChatItem[][];
} {
  const dispatched: unknown[] = [];
  const streamedWith: ChatItem[][] = [];
  let currentItems = items;

  return {
    dispatched,
    streamedWith,
    getItems: () => currentItems,
    dispatch: (action) => {
      dispatched.push(action);
      // Track SET_ITEMS so getItems reflects latest state
      if ('type' in action && action.type === 'SET_ITEMS' && 'items' in action) {
        currentItems = action.items;
      }
    },
    sendStream: async (allItems) => {
      streamedWith.push(allItems);
    },
  };
}

const proposal = (overrides?: Partial<ProposalItem>): ProposalItem => ({
  type: 'event_proposal',
  id: 'p-1',
  action: 'create',
  event: { id: 'evt-1', title: 'Meeting', start: '2026-04-01T10:00:00Z', end: '2026-04-01T11:00:00Z', allDay: false },
  status: 'pending',
  ...overrides,
});

const batchProposal = (overrides?: Partial<BatchProposalItem>): BatchProposalItem => ({
  type: 'batch_proposal',
  id: 'b-1',
  entries: [
    { id: 'tc-1', action: 'delete', event: { id: 'evt-1', title: 'Standup', start: '2026-04-01T09:00:00Z', end: '2026-04-01T09:30:00Z', allDay: false } },
    { id: 'tc-2', action: 'delete', event: { id: 'evt-2', title: 'Retro', start: '2026-04-01T14:00:00Z', end: '2026-04-01T15:00:00Z', allDay: false } },
  ],
  status: 'pending',
  removedIds: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createChatCommands', () => {
  describe('sendMessage', () => {
    it('dispatches SET_ITEMS with user message appended and calls sendStream', async () => {
      const deps = makeDeps([]);
      const cmds = createChatCommands(deps);

      await cmds.sendMessage('hello');

      expect(deps.dispatched).toHaveLength(1);
      const action = deps.dispatched[0] as { type: string; items: ChatItem[] };
      expect(action.type).toBe('SET_ITEMS');
      expect(action.items).toHaveLength(1);
      expect(action.items[0]).toMatchObject({ type: 'message', role: 'user', content: 'hello' });

      expect(deps.streamedWith).toHaveLength(1);
      expect(deps.streamedWith[0]).toHaveLength(1);
    });

    it('preserves existing items', async () => {
      const existing: ChatItem = { type: 'message', id: 'old', role: 'assistant', content: 'hi' };
      const deps = makeDeps([existing]);
      const cmds = createChatCommands(deps);

      await cmds.sendMessage('reply');

      const action = deps.dispatched[0] as { type: string; items: ChatItem[] };
      expect(action.items).toHaveLength(2);
      expect(action.items[0]).toBe(existing);
    });
  });

  describe('acceptProposal', () => {
    it('resolves proposal, dispatches items with confirm message, and streams', async () => {
      const deps = makeDeps([proposal()]);
      const cmds = createChatCommands(deps);

      await cmds.acceptProposal('p-1');

      expect(deps.dispatched).toHaveLength(1);
      const action = deps.dispatched[0] as { type: string; items: ChatItem[] };
      expect(action.type).toBe('SET_ITEMS');

      // Should have resolved proposal + confirm message
      const confirmMsg = action.items.find(
        (i) => i.type === 'message' && i.role === 'user',
      );
      expect(confirmMsg?.type === 'message' && confirmMsg.content).toContain('Yes, create "Meeting"');

      // Confirm has metadata
      expect(confirmMsg?.type === 'message' && confirmMsg.metadata).toBeDefined();

      expect(deps.streamedWith).toHaveLength(1);
    });

    it('includes attendees in metadata when present', async () => {
      const p = proposal({
        event: {
          id: 'evt-1', title: 'Meeting', start: 's', end: 'e', allDay: false,
          attendees: [{ email: 'a@b.com' }, { email: 'c@d.com' }],
        },
      });
      const deps = makeDeps([p]);
      const cmds = createChatCommands(deps);

      await cmds.acceptProposal('p-1');

      const action = deps.dispatched[0] as { type: string; items: ChatItem[] };
      const confirmMsg = action.items.find(
        (i) => i.type === 'message' && i.metadata && 'confirmedProposal' in i.metadata,
      );
      if (confirmMsg?.type === 'message' && confirmMsg.metadata && 'confirmedProposal' in confirmMsg.metadata) {
        expect(confirmMsg.metadata.confirmedProposal.attendees).toEqual(['a@b.com', 'c@d.com']);
      }
    });
  });

  describe('declineProposal', () => {
    it('removes proposal and sends cancel when no pending proposals remain', async () => {
      const deps = makeDeps([proposal()]);
      const cmds = createChatCommands(deps);

      await cmds.declineProposal('p-1');

      // Two SET_ITEMS dispatches: filter, then append cancel
      expect(deps.dispatched).toHaveLength(2);

      // Should have streamed with cancel message
      expect(deps.streamedWith).toHaveLength(1);
      const streamed = deps.streamedWith[0];
      const cancelMsg = streamed.find(
        (i) => i.type === 'message' && i.content === 'No, cancel that.',
      );
      expect(cancelMsg).toBeDefined();
    });

    it('does not send cancel when other pending proposals remain', async () => {
      const deps = makeDeps([proposal({ id: 'p-1' }), proposal({ id: 'p-2' })]);
      const cmds = createChatCommands(deps);

      await cmds.declineProposal('p-1');

      // Only one dispatch (the filter), no stream
      expect(deps.dispatched).toHaveLength(1);
      expect(deps.streamedWith).toHaveLength(0);
    });
  });

  describe('acceptBatch', () => {
    it('marks batch accepted, adds confirm message, and streams', async () => {
      const deps = makeDeps([batchProposal()]);
      const cmds = createChatCommands(deps);

      await cmds.acceptBatch('b-1');

      const action = deps.dispatched[0] as { type: string; items: ChatItem[] };
      const batch = action.items.find(
        (i) => i.type === 'batch_proposal' && i.id === 'b-1',
      );
      expect(batch?.type === 'batch_proposal' && batch.status).toBe('accepted');

      const confirmMsg = action.items.find(
        (i) => i.type === 'message' && i.role === 'user',
      );
      expect(confirmMsg?.type === 'message' && confirmMsg.content).toContain('delete all 2 events');
      expect(deps.streamedWith).toHaveLength(1);
    });

    it('excludes removed events from confirmation', async () => {
      const deps = makeDeps([batchProposal({ removedIds: ['tc-1'] })]);
      const cmds = createChatCommands(deps);

      await cmds.acceptBatch('b-1');

      const action = deps.dispatched[0] as { type: string; items: ChatItem[] };
      const confirmMsg = action.items.find(
        (i) => i.type === 'message' && i.metadata && 'confirmedBatch' in i.metadata,
      );
      if (confirmMsg?.type === 'message' && confirmMsg.metadata && 'confirmedBatch' in confirmMsg.metadata) {
        expect(confirmMsg.metadata.confirmedBatch.entries).toHaveLength(1);
        expect(confirmMsg.metadata.confirmedBatch.entries[0].title).toBe('Retro');
      }
    });

    it('no-ops when batch not found', async () => {
      const deps = makeDeps([]);
      const cmds = createChatCommands(deps);

      await cmds.acceptBatch('nonexistent');

      expect(deps.dispatched).toHaveLength(0);
      expect(deps.streamedWith).toHaveLength(0);
    });
  });

  describe('declineBatch', () => {
    it('removes batch and sends cancel when no pending proposals remain', async () => {
      const deps = makeDeps([batchProposal()]);
      const cmds = createChatCommands(deps);

      await cmds.declineBatch('b-1');

      expect(deps.streamedWith).toHaveLength(1);
      const cancelMsg = deps.streamedWith[0].find(
        (i) => i.type === 'message' && i.content === 'No, cancel that.',
      );
      expect(cancelMsg).toBeDefined();
    });

    it('does not send cancel when other pending proposals remain', async () => {
      const deps = makeDeps([batchProposal(), proposal({ id: 'p-extra' })]);
      const cmds = createChatCommands(deps);

      await cmds.declineBatch('b-1');

      expect(deps.dispatched).toHaveLength(1);
      expect(deps.streamedWith).toHaveLength(0);
    });
  });
});
