import type { ProposalStatus } from '../components/EventCard';
import type { CalendarEvent } from './sse';
import type { ChatItem, MessageItem, ProposalItem, ProposalMetadata, BatchProposalItem, BatchProposalMetadata } from '../types/chat';

/** Extract only the message items into the shape the chat API expects. */
export function extractMessages(
  items: ChatItem[],
): { role: 'user' | 'assistant'; content: string; metadata?: ProposalMetadata | BatchProposalMetadata }[] {
  return items
    .filter((i): i is MessageItem => i.type === 'message' && (i.role !== 'assistant' || i.content.trim().length > 0))
    .map(({ role, content, metadata }) => ({ role, content, ...(metadata && { metadata }) }));
}

/**
 * Mark a proposal as accepted or declined.
 * When accepted, all other pending proposals in the same group are auto-declined.
 */
export function resolveProposal(items: ChatItem[], proposalId: string, accepted: boolean): ChatItem[] {
  const proposal = items.find(
    (i): i is ProposalItem => i.type === 'event_proposal' && i.id === proposalId,
  );

  return items.map((item) => {
    if (item.type !== 'event_proposal') return item;
    if (item.id === proposalId) {
      return { ...item, status: (accepted ? 'accepted' : 'declined') as ProposalStatus };
    }
    if (accepted && item.group && item.group === proposal?.group && item.status === 'pending') {
      return { ...item, status: 'declined' as ProposalStatus };
    }
    return item;
  });
}

/** Build a natural-language confirmation message from a proposal accept/decline. */
export function buildConfirmText(items: ChatItem[], proposalId: string, accepted: boolean): string {
  if (!accepted) return 'No, cancel that.';
  const proposal = items.find(
    (i): i is ProposalItem => i.type === 'event_proposal' && i.id === proposalId,
  );
  if (!proposal) return 'Yes, go ahead.';

  const { action, event } = proposal;
  if (action === 'delete') {
    return event.title && event.title !== 'Untitled'
      ? `Yes, delete "${event.title}".`
      : 'Yes, delete it.';
  }

  const verb = action === 'update' ? 'update' : 'create';
  if (event.start) {
    const time = new Date(event.start).toLocaleString();
    return `Yes, ${verb} "${event.title}" at ${time}.`;
  }
  return `Yes, ${verb} "${event.title}".`;
}

/** Build a natural-language confirmation for accepting a batch of proposals. */
export function buildBatchConfirmText(events: CalendarEvent[], action: 'create' | 'update' | 'delete', isMixed = false): string {
  const count = events.length;
  if (count === 0) return 'Yes, go ahead.';
  if (isMixed) {
    return count === 1
      ? `Yes, confirm "${events[0].title}".`
      : `Yes, confirm all ${count} changes.`;
  }
  if (action === 'delete') {
    return count === 1
      ? `Yes, delete "${events[0].title}".`
      : `Yes, delete all ${count} events.`;
  }
  const verb = action === 'update' ? 'update' : 'create';
  return count === 1
    ? `Yes, ${verb} "${events[0].title}".`
    : `Yes, ${verb} all ${count} events.`;
}

/** Build the metadata payload for a batch proposal acceptance. */
export function buildBatchMetadata(
  batch: BatchProposalItem,
  remainingEvents: CalendarEvent[],
): BatchProposalMetadata {
  return {
    confirmedBatch: {
      batchId: batch.id,
      entries: remainingEvents.map((e) => {
        const entry = batch.entries.find((en) => en.event.id === e.id);
        return {
          eventId: e.id,
          action: entry?.action ?? 'create',
          title: e.title,
          start: e.start,
          end: e.end,
          attendees: e.attendees?.map((a) => a.email),
          recurrence: e.recurrence,
        };
      }),
    },
  };
}
