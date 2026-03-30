import type { ChatItem, ProposalItem, BatchProposalItem } from '../types/chat';

export interface ChatState {
  items: ChatItem[];
  loading: boolean;
  status: string | null;
  error: string | null;
}

export type ChatAction =
  | { type: 'SET_ITEMS'; items: ChatItem[] }
  | { type: 'CLEAR_CHAT' }
  | { type: 'STREAM_START'; id: string }
  | { type: 'PREPARE_RESPONSE'; id: string }
  | { type: 'TOOL_CALL'; tool: string }
  | { type: 'CLEAR_STATUS' }
  | { type: 'APPEND_DELTA'; text: string }
  | { type: 'ADD_PROPOSAL'; proposal: ProposalItem }
  | { type: 'ADD_BATCH_PROPOSAL'; proposal: BatchProposalItem }
  | { type: 'REMOVE_FROM_BATCH'; batchId: string; eventId: string }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'STREAM_DONE' };

export const initialState: ChatState = { items: [], loading: false, status: null, error: null };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_ITEMS':
      return { ...state, items: action.items };

    case 'CLEAR_CHAT':
      return initialState;

    case 'STREAM_START':
      return {
        ...state,
        loading: true,
        error: null,
        status: null,
        items: [
          ...state.items,
          { type: 'message', id: action.id, role: 'assistant', content: '' },
        ],
      };

    case 'PREPARE_RESPONSE': {
      // If the last assistant message already has content (agent spoke before a tool call),
      // open a fresh placeholder for the next response segment.
      const last = state.items[state.items.length - 1];
      const needsPlaceholder =
        last?.type === 'message' && last.role === 'assistant' && Boolean(last.content.trim());
      return {
        ...state,
        status: 'Thinking…',
        items: needsPlaceholder
          ? [...state.items, { type: 'message', id: action.id, role: 'assistant', content: '' }]
          : state.items,
      };
    }

    case 'TOOL_CALL':
      return { ...state, status: `Using ${action.tool.replace(/_/g, ' ')}…` };

    case 'CLEAR_STATUS':
      return { ...state, status: null };

    case 'APPEND_DELTA': {
      const items = [...state.items];
      const last = items[items.length - 1];
      if (last?.type === 'message' && last.role === 'assistant') {
        items[items.length - 1] = { ...last, content: last.content + action.text };
      }
      return { ...state, items };
    }

    case 'ADD_PROPOSAL': {
      const duplicate = state.items.some(
        (i) => i.type === 'event_proposal' &&
          i.event.start === action.proposal.event.start &&
          i.event.end === action.proposal.event.end &&
          i.event.title === action.proposal.event.title &&
          i.action === action.proposal.action &&
          JSON.stringify(i.event.recurrence ?? null) === JSON.stringify(action.proposal.event.recurrence ?? null),
      );
      if (duplicate) return state;
      return { ...state, items: [...state.items, action.proposal] };
    }

    case 'ADD_BATCH_PROPOSAL': {
      const fingerprint = (p: typeof action.proposal) =>
        JSON.stringify(
          p.entries
            .map((e) => `${e.action}|${e.event.title}|${e.event.start}|${e.event.end}`)
            .sort(),
        );
      const duplicate = state.items.some(
        (i) => i.type === 'batch_proposal' && fingerprint(i) === fingerprint(action.proposal),
      );
      if (duplicate) return state;
      return { ...state, items: [...state.items, action.proposal] };
    }

    case 'REMOVE_FROM_BATCH': {
      const items = state.items.map((item) => {
        if (item.type !== 'batch_proposal' || item.id !== action.batchId) return item;
        return { ...item, removedIds: [...item.removedIds, action.eventId] };
      });
      return { ...state, items };
    }

    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false, status: null };

    case 'STREAM_DONE':
      return { ...state, loading: false, status: null };

    default:
      return state;
  }
}

/** Check whether any pending proposals remain in the item list. */
export function hasPendingProposals(items: ChatItem[]): boolean {
  return items.some(
    (i) => (i.type === 'event_proposal' || i.type === 'batch_proposal') && i.status === 'pending',
  );
}
