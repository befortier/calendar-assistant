import type { CalendarEvent } from '../lib/sse';
import type { ProposalStatus, ProposalAction } from '../components/EventCard';

/** Metadata attached to a user confirmation message so the agent knows what was accepted. */
export interface ProposalMetadata {
  confirmedProposal: {
    action: 'create' | 'update' | 'delete';
    eventId: string;
    title: string;
    start: string;
    end: string;
    attendees?: string[];
  };
}

export interface MessageItem {
  type: 'message';
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: ProposalMetadata;
}

export interface ProposalItem {
  type: 'event_proposal';
  id: string;
  action: ProposalAction;
  event: CalendarEvent;
  status: ProposalStatus;
  group?: string;
}

/** A single renderable entry in the chat list — either a text message or an event proposal card. */
export type ChatItem = MessageItem | ProposalItem;
