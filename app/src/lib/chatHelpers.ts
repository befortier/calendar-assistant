import type { ProposalStatus } from '../components/EventCard';
import type { ChatItem, MessageItem, ProposalItem, ProposalMetadata } from '../types/chat';

/** Extract only the message items into the shape the chat API expects. */
export function extractMessages(
  items: ChatItem[],
): { role: string; content: string; metadata?: ProposalMetadata }[] {
  return items
    .filter((i): i is MessageItem => i.type === 'message')
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
