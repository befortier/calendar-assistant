import type { SSEEvent } from '../../../services/sse';

/**
 * Parses a raw SSE response body into an array of typed SSE events.
 */
export function parseSSEStream(body: string): SSEEvent[] {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const eventMatch = block.match(/^event: (.+)$/m);
      const dataMatch = block.match(/^data: (.+)$/m);
      if (!eventMatch || !dataMatch) return null;
      try {
        return { event: eventMatch[1], data: JSON.parse(dataMatch[1]) as SSEEvent['data'] } as SSEEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is SSEEvent => e !== null);
}

/** Extracts just the event type names for sequence assertions. */
export function eventTypes(events: SSEEvent[]): string[] {
  return events.map((e) => e.event);
}

/**
 * Collapses consecutive duplicate event types for sequence assertions.
 * Multiple consecutive deltas become a single "delta" entry.
 */
export function eventSequence(events: SSEEvent[]): string[] {
  const types = eventTypes(events);
  return types.filter((t, i) => i === 0 || t !== types[i - 1]);
}

/** Concatenates all delta text from an SSE event stream. */
export function collectDeltaText(events: SSEEvent[]): string {
  return events
    .filter((e) => e.event === 'delta')
    .map((e) => (e.data as { text?: string }).text ?? '')
    .join('');
}
