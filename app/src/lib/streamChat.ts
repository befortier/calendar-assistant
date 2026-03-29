import { parseSSEChunk, type SSEEvent } from './sse';
import { useAuthStore } from '../stores/auth';
import type { ProposalMetadata, BatchProposalMetadata } from '../types/chat';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export async function streamChat(
  messages: { role: string; content: string; metadata?: ProposalMetadata | BatchProposalMetadata }[],
  timezone: string,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  const token = useAuthStore.getState().token;
  if (!token) {
    useAuthStore.getState().logout();
    return;
  }

  const response = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, timezone }),
  });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    return;
  }

  if (!response.ok || !response.body) {
    onEvent({ event: 'error', data: { message: 'Failed to connect to chat' } });
    onEvent({ event: 'done', data: {} });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Split on complete SSE blocks (double newline)
    const lastDoubleNewline = buffer.lastIndexOf('\n\n');
    if (lastDoubleNewline === -1) continue;

    const complete = buffer.slice(0, lastDoubleNewline + 2);
    buffer = buffer.slice(lastDoubleNewline + 2);

    for (const event of parseSSEChunk(complete)) {
      onEvent(event);
    }
  }

  // Parse any remaining buffer
  if (buffer.trim()) {
    for (const event of parseSSEChunk(buffer)) {
      onEvent(event);
    }
  }
}
