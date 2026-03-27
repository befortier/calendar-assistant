import type { CalendarEvent } from './googleCalendar';

export type SSEEvent =
  | { event: 'status'; data: { type: 'thinking' } }
  | { event: 'tool_call'; data: { tool: string } }
  | { event: 'tool_result'; data: { tool: string; summary: string; error?: boolean } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'event_proposal'; data: { id: string; action: 'create' | 'update' | 'delete'; event: CalendarEvent; group?: string } }
  | { event: 'done'; data: Record<string, never> }
  | { event: 'error'; data: { message: string } };

export type SSEEmitter = (event: SSEEvent) => void;

/** propose_event is display-only — intercepted for UI, never dispatched to Google. */
export function isProposalTool(name: string): boolean {
  return name === 'propose_event';
}

export function formatSSE(event: SSEEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
