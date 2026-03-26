import type { CalendarEvent } from './googleCalendar';

export type SSEEvent =
  | { event: 'status'; data: { type: 'thinking' } }
  | { event: 'tool_call'; data: { tool: string } }
  | { event: 'tool_result'; data: { tool: string; summary: string; error?: boolean } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'event_proposal'; data: { id: string; action: 'create' | 'update' | 'delete'; event: CalendarEvent } }
  | { event: 'done'; data: Record<string, never> }
  | { event: 'error'; data: { message: string } };

export type SSEEmitter = (event: SSEEvent) => void;

const WRITE_TOOLS = new Set(['create_event', 'update_event', 'delete_event']);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

export function formatSSE(event: SSEEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
