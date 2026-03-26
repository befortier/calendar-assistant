export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  attendees?: string[];
  location?: string;
  description?: string;
}

export type SSEEvent =
  | { event: 'status'; data: { type: 'thinking' } }
  | { event: 'tool_call'; data: { tool: string } }
  | { event: 'tool_result'; data: { tool: string; summary: string; error?: boolean } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'event_proposal'; data: { id: string; action: 'create' | 'update' | 'delete'; event: CalendarEvent } }
  | { event: 'done'; data: Record<string, never> }
  | { event: 'error'; data: { message: string } };

export function parseSSEChunk(raw: string): SSEEvent[] {
  return raw
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const eventMatch = block.match(/^event: (.+)$/m);
      const dataMatch = block.match(/^data: (.+)$/m);
      if (!eventMatch || !dataMatch) return null;
      try {
        return { event: eventMatch[1], data: JSON.parse(dataMatch[1]) } as SSEEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is SSEEvent => e !== null);
}
