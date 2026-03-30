import type { Dispatch } from 'react';
import type { ChatItem, ProposalItem, BatchProposalItem } from '../types/chat';
import type { ChatAction } from './chatReducer';
import { hasPendingProposals } from './chatReducer';
import { resolveProposal, buildConfirmText, buildBatchConfirmText, buildBatchMetadata } from '../lib/chatHelpers';

export interface ChatCommandDeps {
  getItems: () => ChatItem[];
  dispatch: Dispatch<ChatAction>;
  sendStream: (items: ChatItem[]) => Promise<void>;
}

function makeCancelMessage(): ChatItem {
  return { type: 'message', id: crypto.randomUUID(), role: 'user', content: 'No, cancel that.' };
}

export function createChatCommands(deps: ChatCommandDeps) {
  return {
    sendMessage: async (text: string): Promise<void> => {
      const userItem: ChatItem = {
        type: 'message',
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
      };
      const allItems = [...(deps.getItems()), userItem];
      deps.dispatch({ type: 'SET_ITEMS', items: allItems });
      await deps.sendStream(allItems);
    },

    acceptProposal: async (proposalId: string): Promise<void> => {
      const items = deps.getItems();
      const proposal = items.find(
        (i): i is ProposalItem => i.type === 'event_proposal' && i.id === proposalId,
      );

      // Build the server payload from current items
      const resolved = resolveProposal(items, proposalId, true);
      const confirmText = buildConfirmText(items, proposalId, true);
      const metadata = proposal
        ? {
            confirmedProposal: {
              action: proposal.action,
              eventId: proposal.event.id,
              title: proposal.event.title,
              start: proposal.event.start,
              end: proposal.event.end,
              attendees: proposal.event.attendees?.map((a) => a.email),
              recurrence: proposal.event.recurrence,
            },
          }
        : undefined;
      const confirmItem: ChatItem = {
        type: 'message',
        id: crypto.randomUUID(),
        role: 'user',
        content: confirmText,
        ...(metadata && { metadata }),
      };
      const allItems = [...resolved, confirmItem];

      // Update UI and stream to server
      deps.dispatch({ type: 'SET_ITEMS', items: allItems });
      await deps.sendStream(allItems);
    },

    declineProposal: async (proposalId: string): Promise<void> => {
      const items = deps.getItems();
      const filtered = items.filter(
        (i) => !(i.type === 'event_proposal' && i.id === proposalId),
      );
      deps.dispatch({ type: 'SET_ITEMS', items: filtered });

      if (!hasPendingProposals(filtered)) {
        const allItems = [...filtered, makeCancelMessage()];
        deps.dispatch({ type: 'SET_ITEMS', items: allItems });
        await deps.sendStream(allItems);
      }
    },

    acceptBatch: async (batchId: string): Promise<void> => {
      const items = deps.getItems();
      const batch = items.find(
        (i): i is BatchProposalItem => i.type === 'batch_proposal' && i.id === batchId,
      );
      if (!batch) return;

      const remainingEntries = batch.entries
        .filter((e) => !batch.removedIds.includes(e.id));
      const remainingEvents = remainingEntries.map((e) => e.event);
      const action = batch.entries[0]?.action ?? 'create';
      const distinctActions = new Set(remainingEntries.map((e) => e.action));
      const isMixed = distinctActions.size > 1;
      const confirmText = buildBatchConfirmText(remainingEvents, action, isMixed);
      const metadata = buildBatchMetadata(batch, remainingEvents);

      const resolved = items.map((i) =>
        i.type === 'batch_proposal' && i.id === batchId
          ? { ...i, status: 'accepted' as const }
          : i,
      );
      const confirmItem: ChatItem = {
        type: 'message',
        id: crypto.randomUUID(),
        role: 'user',
        content: confirmText,
        metadata,
      };
      const allItems = [...resolved, confirmItem];

      deps.dispatch({ type: 'SET_ITEMS', items: allItems });
      await deps.sendStream(allItems);
    },

    declineBatch: async (batchId: string): Promise<void> => {
      const items = deps.getItems();
      const filtered = items.filter(
        (i) => !(i.type === 'batch_proposal' && i.id === batchId),
      );
      deps.dispatch({ type: 'SET_ITEMS', items: filtered });

      if (!hasPendingProposals(filtered)) {
        const allItems = [...filtered, makeCancelMessage()];
        deps.dispatch({ type: 'SET_ITEMS', items: allItems });
        await deps.sendStream(allItems);
      }
    },
  };
}
