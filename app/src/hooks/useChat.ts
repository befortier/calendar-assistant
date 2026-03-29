import { useCallback, useEffect, useReducer, useRef } from 'react';
import { streamChat } from '../lib/streamChat';
import { extractMessages, resolveProposal, buildConfirmText } from '../lib/chatHelpers';
import type { SSEEvent } from '../lib/sse';
import type { ChatItem, ProposalItem } from '../types/chat';

// Re-export types that consumers (ChatPage, streamChat) import from this module
export type { ProposalMetadata, MessageItem, ProposalItem, ChatItem } from '../types/chat';

// --- Reducer ---

interface ChatState {
  items: ChatItem[];
  loading: boolean;
  status: string | null;
  error: string | null;
}

type ChatAction =
  | { type: 'SET_ITEMS'; items: ChatState['items'] }
  | { type: 'STREAM_START' }
  | { type: 'STATUS_TICK' }
  | { type: 'TOOL_CALL'; tool: string }
  | { type: 'CLEAR_STATUS' }
  | { type: 'APPEND_DELTA'; text: string }
  | { type: 'ADD_PROPOSAL'; proposal: ProposalItem }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'STREAM_DONE' };

const initialState: ChatState = { items: [], loading: false, status: null, error: null };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_ITEMS':
      return { ...state, items: action.items };

    case 'STREAM_START':
      return {
        ...state,
        loading: true,
        error: null,
        status: null,
        items: [
          ...state.items,
          { type: 'message', id: crypto.randomUUID(), role: 'assistant', content: '' },
        ],
      };

    case 'STATUS_TICK': {
      // If the last assistant message already has content (agent spoke before a tool call),
      // open a fresh placeholder for the next response segment.
      const last = state.items[state.items.length - 1];
      const needsPlaceholder =
        last?.type === 'message' && last.role === 'assistant' && Boolean(last.content.trim());
      return {
        ...state,
        status: 'Thinking…',
        items: needsPlaceholder
          ? [...state.items, { type: 'message', id: crypto.randomUUID(), role: 'assistant', content: '' }]
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

    case 'ADD_PROPOSAL':
      return { ...state, items: [...state.items, action.proposal] };

    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false, status: null };

    case 'STREAM_DONE':
      return { ...state, loading: false, status: null };

    default:
      return state;
  }
}

// --- Hook ---

export function useChat() {
  const [{ items, loading, status, error }, dispatch] = useReducer(chatReducer, initialState);

  const bottomRef = useRef<HTMLDivElement>(null);
  // Stable ref so async callbacks can read current items without stale closures
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items, status]);

  // Translate raw SSE events into reducer actions.
  // dispatch is stable (guaranteed by useReducer) — empty dep array is intentional.
  const handleEvent = useCallback((event: SSEEvent) => {
    switch (event.event) {
      case 'status':
        dispatch({ type: 'STATUS_TICK' });
        break;
      case 'tool_call':
        dispatch({ type: 'TOOL_CALL', tool: event.data.tool });
        break;
      case 'tool_result':
        dispatch({ type: 'CLEAR_STATUS' });
        break;
      case 'delta':
        dispatch({ type: 'APPEND_DELTA', text: event.data.text });
        break;
      case 'event_proposal':
        dispatch({
          type: 'ADD_PROPOSAL',
          proposal: {
            type: 'event_proposal',
            id: event.data.id,
            action: event.data.action,
            event: event.data.event,
            status: 'pending',
            group: event.data.group,
          },
        });
        break;
      case 'error':
        dispatch({ type: 'SET_ERROR', error: event.data.message });
        break;
      case 'done':
        dispatch({ type: 'STREAM_DONE' });
        break;
    }
  }, []);

  const sendStream = useCallback(
    async (allItems: ChatState['items']) => {
      dispatch({ type: 'STREAM_START' });
      try {
        await streamChat(
          extractMessages(allItems),
          Intl.DateTimeFormat().resolvedOptions().timeZone,
          handleEvent,
        );
      } catch {
        dispatch({ type: 'SET_ERROR', error: 'Connection lost. Please try again.' });
      }
    },
    [handleEvent],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const userItem = {
        type: 'message' as const,
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: text,
      };
      const allItems = [...itemsRef.current, userItem];
      dispatch({ type: 'SET_ITEMS', items: allItems });
      await sendStream(allItems);
    },
    [sendStream],
  );

  const respondToProposal = useCallback(
    async (proposalId: string, accepted: boolean) => {
      if (!accepted) {
        // Decline is local-only: remove the card, then notify the agent only if no other
        // pending proposals remain (avoids a premature "cancel" when there are alternatives).
        const filtered = itemsRef.current.filter(
          (i) => !(i.type === 'event_proposal' && i.id === proposalId),
        );
        dispatch({ type: 'SET_ITEMS', items: filtered });

        const remaining = filtered.filter(
          (i) => i.type === 'event_proposal' && i.status === 'pending',
        );
        if (remaining.length === 0) {
          const declineItem = {
            type: 'message' as const,
            id: crypto.randomUUID(),
            role: 'user' as const,
            content: 'No, cancel that.',
          };
          const allItems = [...filtered, declineItem];
          dispatch({ type: 'SET_ITEMS', items: allItems });
          await sendStream(allItems);
        }
        return;
      }

      // Accept: resolve the proposal group eagerly (prevents stale-state overwrite),
      // then send a natural-language confirmation with structured metadata.
      const proposal = itemsRef.current.find(
        (i): i is ProposalItem => i.type === 'event_proposal' && i.id === proposalId,
      );
      const confirmText = buildConfirmText(itemsRef.current, proposalId, true);
      const resolved = resolveProposal(itemsRef.current, proposalId, true);
      const metadata = proposal
        ? {
            confirmedProposal: {
              action: proposal.action,
              eventId: proposal.event.id,
              title: proposal.event.title,
              start: proposal.event.start,
              end: proposal.event.end,
              attendees: proposal.event.attendees?.map((a) => a.email),
            },
          }
        : undefined;

      const confirmItem = {
        type: 'message' as const,
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: confirmText,
        ...(metadata && { metadata }),
      };
      const allItems = [...resolved, confirmItem];
      dispatch({ type: 'SET_ITEMS', items: allItems });
      await sendStream(allItems);
    },
    [sendStream],
  );

  return { items, loading, status, error, bottomRef, sendMessage, respondToProposal };
}
