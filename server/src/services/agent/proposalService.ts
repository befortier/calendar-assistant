import type { ToolCall } from './types';
import type { SSEEmitter } from '../sse';
import { SSEEventType } from '../sse';
import type { CalendarEvent } from '../googleCalendar';
import type { BatchProposalEntry } from '../sse';

// ---------------------------------------------------------------------------
// Helpers — only used to build proposal events
// ---------------------------------------------------------------------------

function toCalendarEvent(input: Record<string, unknown>): CalendarEvent {
  return {
    id: (input.id as string) ?? '',
    title: (input.title as string) ?? 'Untitled',
    start: (input.start as string) ?? '',
    end: (input.end as string) ?? '',
    allDay: Boolean(input.allDay),
    attendees: Array.isArray(input.attendees)
      ? input.attendees.filter((e): e is string => typeof e === 'string').map((email) => ({ email }))
      : undefined,
    location: input.location as string | undefined,
    description: input.description as string | undefined,
  };
}

function toAction(input: Record<string, unknown>): 'create' | 'update' | 'delete' {
  return (['create', 'update', 'delete'].includes(input.action as string)
    ? input.action as 'create' | 'update' | 'delete'
    : 'create');
}

// ---------------------------------------------------------------------------
// Core proposal functions
// ---------------------------------------------------------------------------

/** Cleans up a propose_event tool call, normalizing fields the model sometimes mangles. */
export function sanitizeProposal(tc: ToolCall): ToolCall {
  const input = { ...tc.input };

  // The model sometimes embeds XML-like content in the id field that contains the title.
  // Extract a clean title from wherever we can find it.
  const rawId = typeof input.id === 'string' ? input.id : '';
  const rawTitle = typeof input.title === 'string' ? input.title : '';

  // If id contains non-ID content (XML tags, long strings), it's mangled — clear it.
  if (rawId.length > 100 || rawId.includes('<') || rawId.includes('\n')) {
    input.id = '';
  }

  // If title is missing but we can find something usable, fall back.
  if (!rawTitle.trim()) {
    input.title = 'Meeting';
  }

  return { ...tc, input };
}

/** Removes duplicate proposals (same start + end time). Keeps first occurrence. */
export function deduplicateProposals(proposals: ToolCall[]): ToolCall[] {
  const seen = new Set<string>();
  return proposals.filter((tc) => {
    const key = `${String(tc.input.start)}|${String(tc.input.end)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Serializes proposals to SSE — handles both `propose_event` and `propose_batched_events`. */
export function emitProposals(toolCalls: ToolCall[], emit: SSEEmitter): void {
  for (const tc of toolCalls) {
    if (tc.name === 'propose_batched_events') {
      // Expand the events array into a single BatchProposal
      const rawEvents = Array.isArray(tc.input.events)
        ? (tc.input.events as Record<string, unknown>[])
        : [];
      const entries: BatchProposalEntry[] = rawEvents.map((e, i) => ({
        id: `${tc.id}-${i}`,
        action: toAction(e),
        event: toCalendarEvent(e),
      }));
      if (entries.length > 0) {
        emit({ event: SSEEventType.BatchProposal, data: { batchId: crypto.randomUUID(), entries } });
      }
    } else {
      // propose_event — always individual, never batched
      emit({
        event: SSEEventType.EventProposal,
        data: { id: tc.id, action: toAction(tc.input), event: toCalendarEvent(tc.input) },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface ProposalService {
  /** Appends proposal tool calls to the pending list. */
  accumulate(proposals: ToolCall[]): void;
  /** Deduplicates, sanitizes, and emits all pending proposals then clears the list. */
  flush(emit: SSEEmitter): void;
}

/** Creates a stateful proposal accumulator that owns pendingProposals. */
export function createProposalService(): ProposalService {
  const pendingProposals: ToolCall[] = [];

  return {
    accumulate(proposals: ToolCall[]): void {
      pendingProposals.push(...proposals);
    },

    flush(emit: SSEEmitter): void {
      if (pendingProposals.length === 0) return;

      const singles = pendingProposals
        .filter((tc) => tc.name === 'propose_event')
        .map(sanitizeProposal);
      const batches = pendingProposals.filter((tc) => tc.name === 'propose_batched_events');
      const deduped = deduplicateProposals(singles);
      emitProposals([...deduped, ...batches], emit);
    },
  };
}
