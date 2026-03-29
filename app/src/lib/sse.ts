export interface AttendeeInfo {
  email: string;
  responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  attendees?: AttendeeInfo[];
  location?: string;
  description?: string;
}

export interface BatchProposalEntry {
  id: string;
  action: 'create' | 'update' | 'delete';
  event: CalendarEvent;
}

export type SSEEvent =
  | { event: 'status'; data: { type: 'thinking' } }
  | { event: 'tool_call'; data: { tool: string } }
  | { event: 'tool_result'; data: { tool: string; summary: string; error?: boolean } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'event_proposal'; data: { id: string; action: 'create' | 'update' | 'delete'; event: CalendarEvent; group?: string } }
  | { event: 'batch_proposal'; data: { batchId: string; entries: BatchProposalEntry[] } }
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
        // JSON.parse is untyped by nature; the cast to SSEEvent is intentional
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        return { event: eventMatch[1], data: JSON.parse(dataMatch[1]) } as SSEEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is SSEEvent => e !== null);
}
