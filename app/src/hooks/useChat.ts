import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { streamChat } from '../lib/streamChat';
import { extractMessages } from '../lib/chatHelpers';
import { useCalendarStore } from '../stores/calendar';
import type { SSEEvent } from '../lib/sse';
import { chatReducer, initialState } from './chatReducer';
import type { ChatState } from './chatReducer';
import { createChatCommands } from './chatCommands';

// Re-export types that consumers (ChatPage, streamChat) import from this module
export type { ProposalMetadata, MessageItem, ProposalItem, BatchProposalItem, ChatItem } from '../types/chat';

export function useChat() {
  const [{ items, loading, status, error }, dispatch] = useReducer(chatReducer, initialState);

  const bottomRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  useLayoutEffect(() => { itemsRef.current = items; });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items, status]);

  // Translate raw SSE events into reducer actions.
  const handleEvent = useCallback((event: SSEEvent) => {
    switch (event.event) {
      case 'status':
        dispatch({ type: 'PREPARE_RESPONSE', id: crypto.randomUUID() });
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

  // Store sendStream in a ref so commands stay stable across renders.
  // The ref is updated after every render via useLayoutEffect, same pattern as itemsRef.
  const sendStreamRef = useRef(sendStream);
  useLayoutEffect(() => { sendStreamRef.current = sendStream; });

  // Commands are created in an effect (only runs once) so they can close over refs
  // without triggering react-hooks/refs during render.
  const commandsRef = useRef<ReturnType<typeof createChatCommands> | null>(null);
  useEffect(() => {
    if (commandsRef.current) return;
    commandsRef.current = createChatCommands({
      getItems: () => itemsRef.current,
      dispatch,
      sendStream: (allItems) => sendStreamRef.current(allItems),
    });
  }, []);

  const sendMessage = useCallback(
    (text: string) => commandsRef.current?.sendMessage(text) ?? Promise.resolve(),
    [],
  );

  const removeFromBatch = useCallback((batchId: string, eventId: string) => {
    dispatch({ type: 'REMOVE_FROM_BATCH', batchId, eventId });
  }, []);

  const respondToProposal = useCallback(
    (proposalId: string, accepted: boolean) =>
      accepted
        ? commandsRef.current?.acceptProposal(proposalId) ?? Promise.resolve()
        : commandsRef.current?.declineProposal(proposalId) ?? Promise.resolve(),
    [],
  );

  const respondToBatch = useCallback(
    (batchId: string, accepted: boolean) =>
      accepted
        ? commandsRef.current?.acceptBatch(batchId) ?? Promise.resolve()
        : commandsRef.current?.declineBatch(batchId) ?? Promise.resolve(),
    [],
  );

  const clearChat = useCallback(() => dispatch({ type: 'CLEAR_CHAT' }), []);

  return {
    items, loading, status, error, bottomRef,
    sendMessage, respondToProposal, removeFromBatch, respondToBatch, clearChat,
  };
}
