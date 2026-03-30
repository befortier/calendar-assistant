import type { CalendarEvent } from './googleCalendar';

export const SSEEventType = {
  Status: 'status',
  Delta: 'delta',
  ToolCall: 'tool_call',
  ToolResult: 'tool_result',
  EventProposal: 'event_proposal',
  BatchProposal: 'batch_proposal',
  Done: 'done',
  Error: 'error',
} as const;

export type SSEEventType = (typeof SSEEventType)[keyof typeof SSEEventType];

export interface StatusPayload {
  type: 'thinking';
}

export interface DeltaPayload {
  text: string;
}

export interface ToolCallPayload {
  tool: string;
}

export interface ToolResultPayload {
  tool: string;
  summary: string;
  error?: boolean;
}

export interface EventProposalPayload {
  id: string;
  action: 'create' | 'update' | 'delete';
  event: CalendarEvent;
  group?: string;
}

export interface BatchProposalEntry {
  id: string;
  action: 'create' | 'update' | 'delete';
  event: CalendarEvent;
}

export interface BatchProposalPayload {
  batchId: string;
  entries: BatchProposalEntry[];
}

export type DonePayload = Record<string, never>;

export interface ErrorPayload {
  message: string;
}

export type SSEEvent =
  | { event: typeof SSEEventType.Status; data: StatusPayload }
  | { event: typeof SSEEventType.Delta; data: DeltaPayload }
  | { event: typeof SSEEventType.ToolCall; data: ToolCallPayload }
  | { event: typeof SSEEventType.ToolResult; data: ToolResultPayload }
  | { event: typeof SSEEventType.EventProposal; data: EventProposalPayload }
  | { event: typeof SSEEventType.BatchProposal; data: BatchProposalPayload }
  | { event: typeof SSEEventType.Done; data: DonePayload }
  | { event: typeof SSEEventType.Error; data: ErrorPayload };

export type SSEEmitter = (event: SSEEvent) => void;

export function formatSSE(event: SSEEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
