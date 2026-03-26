import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat } from '../lib/streamChat';
import type { CalendarEvent, SSEEvent } from '../lib/sse';
import type { ProposalStatus, ProposalAction } from '../components/EventCard';

export interface MessageItem {
  type: 'message';
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface ProposalItem {
  type: 'event_proposal';
  id: string;
  action: ProposalAction;
  event: CalendarEvent;
  status: ProposalStatus;
  group?: string;
}

export type ChatItem = MessageItem | ProposalItem;

function extractMessages(items: ChatItem[]): { role: string; content: string }[] {
  return items
    .filter((i): i is MessageItem => i.type === 'message')
    .map(({ role, content }) => ({ role, content }));
}

function resolveProposal(items: ChatItem[], proposalId: string, accepted: boolean): ChatItem[] {
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

function buildConfirmText(items: ChatItem[], proposalId: string, accepted: boolean): string {
  if (!accepted) return 'No, cancel that.';
  const proposal = items.find(
    (i): i is ProposalItem => i.type === 'event_proposal' && i.id === proposalId,
  );
  if (proposal) {
    const time = new Date(proposal.event.start).toLocaleString();
    return `Yes, create "${proposal.event.title}" at ${time}.`;
  }
  return 'Yes, go ahead.';
}

interface EventHandlerDeps {
  setItems: React.Dispatch<React.SetStateAction<ChatItem[]>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

function createEventHandler(deps: EventHandlerDeps) {
  return (event: SSEEvent) => {
    switch (event.event) {
      case 'status':
        deps.setStatus('Thinking…');
        deps.setItems((prev) => {
          const last = prev[prev.length - 1];
          if (last?.type === 'message' && last.role === 'assistant' && last.content.trim()) {
            return [...prev, { type: 'message', id: crypto.randomUUID(), role: 'assistant', content: '' }];
          }
          return prev;
        });
        break;
      case 'tool_call':
        deps.setStatus(`Using ${event.data.tool.replace(/_/g, ' ')}…`);
        break;
      case 'tool_result':
        deps.setStatus(null);
        break;
      case 'delta':
        deps.setItems((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.type === 'message' && last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + event.data.text };
          }
          return updated;
        });
        break;
      case 'event_proposal':
        deps.setItems((prev) => [
          ...prev,
          {
            type: 'event_proposal',
            id: event.data.id,
            action: event.data.action,
            event: event.data.event,
            status: 'pending' as ProposalStatus,
            group: event.data.group,
          },
        ]);
        break;
      case 'error':
        deps.setError(event.data.message);
        break;
      case 'done':
        deps.setLoading(false);
        deps.setStatus(null);
        break;
    }
  };
}

export function useChat() {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items, status]);

  const handleEvent = useCallback(
    createEventHandler({ setItems, setStatus, setError, setLoading }),
    [],
  );

  const sendStream = useCallback(async (allItems: ChatItem[]) => {
    setItems((prev) => [...prev, { type: 'message', id: crypto.randomUUID(), role: 'assistant', content: '' }]);
    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      await streamChat(extractMessages(allItems), Intl.DateTimeFormat().resolvedOptions().timeZone, handleEvent);
    } catch {
      setError('Connection lost. Please try again.');
      setLoading(false);
      setStatus(null);
    }
  }, [handleEvent]);

  const sendMessage = useCallback(async (text: string) => {
    const userItem: MessageItem = { type: 'message', id: crypto.randomUUID(), role: 'user', content: text };
    const allItems = [...itemsRef.current, userItem];
    setItems(allItems);
    await sendStream(allItems);
  }, [sendStream]);

  const respondToProposal = useCallback(async (proposalId: string, accepted: boolean) => {
    const confirmText = buildConfirmText(itemsRef.current, proposalId, accepted);
    setItems((prev) => resolveProposal(prev, proposalId, accepted));
    const confirmItem: MessageItem = {
      type: 'message', id: crypto.randomUUID(), role: 'user', content: confirmText,
    };
    const allItems = [...itemsRef.current, confirmItem];
    setItems(allItems);
    await sendStream(allItems);
  }, [sendStream]);

  return { items, loading, status, error, bottomRef, sendMessage, respondToProposal };
}
