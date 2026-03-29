import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, type Dispatch } from 'react';
import { streamChat } from '../lib/streamChat';
import { extractMessages, resolveProposal, buildConfirmText, buildBatchConfirmText, buildBatchMetadata } from '../lib/chatHelpers';
import { useCalendarStore } from '../stores/calendar';
import type { SSEEvent } from '../lib/sse';
import type { ChatItem, ProposalItem, BatchProposalItem } from '../types/chat';

// Re-export types that consumers (ChatPage, streamChat) import from this module
export type { ProposalMetadata, MessageItem, ProposalItem, BatchProposalItem, ChatItem } from '../types/chat';

// --- Reducer ---

interface ChatState {
  items: ChatItem[];
  loading: boolean;
  status: string | null;
  error: string | null;
}

type ChatAction =
  | { type: 'SET_ITEMS'; items: ChatState['items'] }
  | { type: 'CLEAR_CHAT' }
  | { type: 'STREAM_START'; id: string }
  | { type: 'STATUS_TICK'; id: string }
  | { type: 'TOOL_CALL'; tool: string }
  | { type: 'CLEAR_STATUS' }
  | { type: 'APPEND_DELTA'; text: string }
  | { type: 'ADD_PROPOSAL'; proposal: ProposalItem }
  | { type: 'ADD_BATCH_PROPOSAL'; proposal: BatchProposalItem }
  | { type: 'REMOVE_FROM_BATCH'; batchId: string; eventId: string }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'STREAM_DONE' };

const initialState: ChatState = { items: [], loading: false, status: null, error: null };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
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

    case 'ADD_PROPOSAL':
      return { ...state, items: [...state.items, action.proposal] };

    case 'ADD_BATCH_PROPOSAL':
      return { ...state, items: [...state.items, action.proposal] };

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

// --- Proposal response helpers (extracted to reduce hook complexity) ---

type ChatDispatch = Dispatch<ChatAction>;
type SendStream = (items: ChatItem[]) => Promise<void>;

function hasPendingProposals(items: ChatItem[]): boolean {
  return items.some(
    (i) => (i.type === 'event_proposal' || i.type === 'batch_proposal') && i.status === 'pending',
  );
}

function makeCancelMessage(): ChatItem {
  return { type: 'message', id: crypto.randomUUID(), role: 'user', content: 'No, cancel that.' };
}

async function declineAndMaybeCancel(
  filtered: ChatItem[],
  dispatch: ChatDispatch,
  sendStream: SendStream,
): Promise<void> {
  dispatch({ type: 'SET_ITEMS', items: filtered });
  if (!hasPendingProposals(filtered)) {
    const allItems = [...filtered, makeCancelMessage()];
    dispatch({ type: 'SET_ITEMS', items: allItems });
    await sendStream(allItems);
  }
}

async function handleProposalDecline(
  proposalId: string,
  items: ChatItem[],
  dispatch: ChatDispatch,
  sendStream: SendStream,
): Promise<void> {
  const filtered = items.filter(
    (i) => !(i.type === 'event_proposal' && i.id === proposalId),
  );
  await declineAndMaybeCancel(filtered, dispatch, sendStream);
}

async function handleProposalAccept(
  proposalId: string,
  items: ChatItem[],
  dispatch: ChatDispatch,
  sendStream: SendStream,
): Promise<void> {
  const proposal = items.find(
    (i): i is ProposalItem => i.type === 'event_proposal' && i.id === proposalId,
  );
  const confirmText = buildConfirmText(items, proposalId, true);
  const resolved = resolveProposal(items, proposalId, true);
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
}

async function handleBatchDecline(
  batchId: string,
  items: ChatItem[],
  dispatch: ChatDispatch,
  sendStream: SendStream,
): Promise<void> {
  const filtered = items.filter(
    (i) => !(i.type === 'batch_proposal' && i.id === batchId),
  );
  await declineAndMaybeCancel(filtered, dispatch, sendStream);
}

async function handleBatchAccept(
  batchId: string,
  items: ChatItem[],
  dispatch: ChatDispatch,
  sendStream: SendStream,
): Promise<void> {
  const batch = items.find(
    (i): i is BatchProposalItem => i.type === 'batch_proposal' && i.id === batchId,
  );
  if (!batch) return;

  const remainingEvents = batch.entries
    .filter((e) => !batch.removedIds.includes(e.event.id))
    .map((e) => e.event);

  const action = batch.entries[0]?.action ?? 'create';
  const confirmText = buildBatchConfirmText(remainingEvents, action);
  const metadata = buildBatchMetadata(batch, remainingEvents);

  const resolved = items.map((i) =>
    i.type === 'batch_proposal' && i.id === batchId ? { ...i, status: 'accepted' as const } : i,
  );

  const confirmItem = {
    type: 'message' as const,
    id: crypto.randomUUID(),
    role: 'user' as const,
    content: confirmText,
    metadata,
  };
  const allItems = [...resolved, confirmItem];
  dispatch({ type: 'SET_ITEMS', items: allItems });
  await sendStream(allItems);
}

// --- Hook ---

export function useChat() {
  const [{ items, loading, status, error }, dispatch] = useReducer(chatReducer, initialState);

  const bottomRef = useRef<HTMLDivElement>(null);
  // Stable ref so async callbacks always read the latest items without stale closures.
  // Synced in useLayoutEffect (runs synchronously after render, before paint) so
  // the ref is always current before any browser event or async callback can fire.
  const itemsRef = useRef(items);
  useLayoutEffect(() => { itemsRef.current = items; });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items, status]);

  // Translate raw SSE events into reducer actions.
  // dispatch is stable (guaranteed by useReducer) — empty dep array is intentional.
  const handleEvent = useCallback((event: SSEEvent) => {
    switch (event.event) {
      case 'status':
        dispatch({ type: 'STATUS_TICK', id: crypto.randomUUID() });
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
      case 'batch_proposal':
        dispatch({
          type: 'ADD_BATCH_PROPOSAL',
          proposal: {
            type: 'batch_proposal',
            id: event.data.batchId,
            entries: event.data.entries,
            status: 'pending',
            removedIds: [],
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
      dispatch({ type: 'STREAM_START', id: crypto.randomUUID() });
      try {
        const { calendarId, calendarName } = useCalendarStore.getState();
        await streamChat(
          extractMessages(allItems),
          Intl.DateTimeFormat().resolvedOptions().timeZone,
          calendarId,
          calendarName ?? undefined,
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
      if (!accepted) return handleProposalDecline(proposalId, itemsRef.current, dispatch, sendStream);
      return handleProposalAccept(proposalId, itemsRef.current, dispatch, sendStream);
    },
    [sendStream],
  );

  const removeFromBatch = useCallback((batchId: string, eventId: string) => {
    dispatch({ type: 'REMOVE_FROM_BATCH', batchId, eventId });
  }, []);

  const respondToBatch = useCallback(
    async (batchId: string, accepted: boolean) => {
      if (!accepted) return handleBatchDecline(batchId, itemsRef.current, dispatch, sendStream);
      return handleBatchAccept(batchId, itemsRef.current, dispatch, sendStream);
    },
    [sendStream],
  );

  const clearChat = useCallback(() => dispatch({ type: 'CLEAR_CHAT' }), []);

  return { items, loading, status, error, bottomRef, sendMessage, respondToProposal, removeFromBatch, respondToBatch, clearChat };
}
