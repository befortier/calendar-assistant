import type { GoogleCalendarService, CreateEventInput, UpdateEventInput, RecurrenceScope } from './google';
import type { CalendarEvent } from './google';
import type { SSEEmitter, BatchProposalEntry } from '../../sse';
import { SSEEventType } from '../../sse';
import { invertBusy } from './algorithms';
import { asString, asDate, asStringArray, asRecurrenceScope, asReminders } from '../../agent/llmInputValidation';

/**
 * Dispatches a named LLM tool call to the underlying GoogleCalendarService.
 * Inject this interface into anything that needs to execute calendar tools
 * (e.g. the agent loop or chat route) without coupling it to validation or
 * Google-specific details.
 */
export interface CalendarToolDispatcher {
  dispatch(name: string, input: Record<string, unknown>): Promise<string>;
}

/**
 * Creates a `CalendarToolDispatcher` bound to the given calendar service,
 * user timezone, and SSE emitter. Input validation is handled internally —
 * callers only see the `dispatch` method.
 */
export function makeCalendarToolDispatcher(
  service: GoogleCalendarService,
  emit: SSEEmitter,
  userTimeZone?: string,
): CalendarToolDispatcher {
  return { dispatch: (name, input) => dispatchTool(name, input, service, emit, userTimeZone) };
}

// ---------------------------------------------------------------------------
// Internal handlers — not exported; validation via llmInputValidation helpers
// ---------------------------------------------------------------------------

async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  service: GoogleCalendarService,
  emit: SSEEmitter,
  userTimeZone?: string,
): Promise<string> {
  switch (name) {
    case 'get_events':              return handleGetEvents(input, service);
    case 'get_freebusy':            return handleGetFreebusy(input, service);
    case 'create_event':            return handleCreateEvent(input, service, userTimeZone);
    case 'update_event':            return handleUpdateEvent(input, service);
    case 'delete_event':            return handleDeleteEvent(input, service);
    case 'propose_events':          return handleProposeEvents(input, emit);
    default:                        throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleGetEvents(
  input: Record<string, unknown>,
  service: GoogleCalendarService,
): Promise<string> {
  const start = asDate(input.start, 'start');
  const end = asDate(input.end, 'end');
  const events = await service.getEvents(start, end);
  return JSON.stringify(events);
}

async function handleGetFreebusy(
  input: Record<string, unknown>,
  service: GoogleCalendarService,
): Promise<string> {
  const emails = asStringArray(input.emails, 'emails');
  const start = asDate(input.start, 'start');
  const end = asDate(input.end, 'end');
  const result = await service.getFreeBusy(emails, start, end);
  const enriched = Object.fromEntries(
    Object.entries(result).map(([email, data]) => [
      email,
      { ...data, free: data.accessible ? invertBusy(data.busy, start, end) : [] },
    ]),
  );
  return JSON.stringify(enriched);
}

async function handleCreateEvent(
  input: Record<string, unknown>,
  service: GoogleCalendarService,
  userTimeZone?: string,
): Promise<string> {
  const createInput: CreateEventInput = {
    title: asString(input.title, 'title'),
    start: asString(input.start, 'start'),
    end: asString(input.end, 'end'),
    attendees: input.attendees != null ? asStringArray(input.attendees, 'attendees') : undefined,
    description: input.description != null ? asString(input.description, 'description') : undefined,
    location: input.location != null ? asString(input.location, 'location') : undefined,
    recurrence: input.recurrence != null ? asStringArray(input.recurrence, 'recurrence') : undefined,
    reminders: input.reminders != null ? asReminders(input.reminders, 'reminders') : undefined,
    allDay: input.allDay != null ? Boolean(input.allDay) : undefined,
    timeZone: userTimeZone,
  };
  const event = await service.createEvent(createInput);
  return JSON.stringify(event);
}

async function handleUpdateEvent(
  input: Record<string, unknown>,
  service: GoogleCalendarService,
): Promise<string> {
  const id = asString(input.id, 'id');
  const scope = input.recurrence_scope != null ? asRecurrenceScope(input.recurrence_scope) : undefined;
  if (scope === 'this_and_following')
    throw new Error("this_and_following is not supported for update_event");
  const updates: UpdateEventInput = {};
  if (input.title != null) updates.title = asString(input.title, 'title');
  if (input.start != null) updates.start = asString(input.start, 'start');
  if (input.end != null) updates.end = asString(input.end, 'end');
  if (input.attendees != null) updates.attendees = asStringArray(input.attendees, 'attendees');
  if (input.description != null) updates.description = asString(input.description, 'description');
  if (input.location != null) updates.location = asString(input.location, 'location');
  if (input.reminders != null) updates.reminders = asReminders(input.reminders, 'reminders');
  if (input.allDay != null) updates.allDay = Boolean(input.allDay);
  const event = await service.updateEvent(id, updates, scope);
  return JSON.stringify(event);
}

async function handleDeleteEvent(
  input: Record<string, unknown>,
  service: GoogleCalendarService,
): Promise<string> {
  const id = asString(input.id, 'id');
  const scope: RecurrenceScope | undefined =
    input.recurrence_scope != null ? asRecurrenceScope(input.recurrence_scope) : undefined;
  await service.deleteEvent(id, scope);
  return JSON.stringify({ success: true });
}

// ---------------------------------------------------------------------------
// Proposal handlers — emit SSE events directly; never touch Google Calendar
// ---------------------------------------------------------------------------

function sanitizeProposalInput(input: Record<string, unknown>): Record<string, unknown> {
  const result = { ...input };

  // The model sometimes embeds XML-like content in the id field that contains the title.
  const rawId = typeof result.id === 'string' ? result.id : '';
  if (rawId.length > 100 || rawId.includes('<') || rawId.includes('\n')) {
    result.id = '';
  }

  // If title is missing, fall back to a sensible default.
  const rawTitle = typeof result.title === 'string' ? result.title : '';
  if (!rawTitle.trim()) {
    result.title = 'Meeting';
  }

  return result;
}

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
    recurrence: Array.isArray(input.recurrence)
      ? input.recurrence.filter((r): r is string => typeof r === 'string')
      : undefined,
  };
}

function toAction(input: Record<string, unknown>): 'create' | 'update' | 'delete' {
  return (['create', 'update', 'delete'].includes(input.action as string)
    ? input.action as 'create' | 'update' | 'delete'
    : 'create');
}

type ConfirmationMode = 'single' | 'choose_one' | 'accept_all';

function asConfirmationMode(value: unknown): ConfirmationMode {
  if (value === 'single' || value === 'choose_one' || value === 'accept_all') return value;
  throw new Error(
    `propose_events requires confirmation_mode to be 'single', 'choose_one', or 'accept_all' (got ${JSON.stringify(value)})`,
  );
}

function handleProposeEvents(input: Record<string, unknown>, emit: SSEEmitter): Promise<string> {
  const mode = asConfirmationMode(input.confirmation_mode);
  const rawEvents = Array.isArray(input.events) ? (input.events as Record<string, unknown>[]) : [];

  if (mode === 'single') {
    if (rawEvents.length !== 1) {
      throw new Error(
        `propose_events with confirmation_mode 'single' requires exactly one event (got ${rawEvents.length}). Use 'choose_one' for alternatives or 'accept_all' for a batch.`,
      );
    }
    const sanitized = sanitizeProposalInput(rawEvents[0]);
    emit({
      event: SSEEventType.EventProposal,
      data: {
        id: (sanitized.id as string) || crypto.randomUUID(),
        action: toAction(sanitized),
        event: toCalendarEvent(sanitized),
      },
    });
    return Promise.resolve('Proposal shown to user.');
  }

  if (mode === 'choose_one') {
    if (rawEvents.length < 2) {
      throw new Error(
        `propose_events with confirmation_mode 'choose_one' requires at least 2 alternatives (got ${rawEvents.length}). Use 'single' for one event.`,
      );
    }
    const groupId = crypto.randomUUID();
    for (const event of rawEvents) {
      const sanitized = sanitizeProposalInput(event);
      emit({
        event: SSEEventType.EventProposal,
        data: {
          id: (sanitized.id as string) || crypto.randomUUID(),
          action: toAction(sanitized),
          event: toCalendarEvent(sanitized),
          group: groupId,
        },
      });
    }
    return Promise.resolve('Proposal shown to user.');
  }

  // mode === 'accept_all'
  if (rawEvents.length < 1) {
    throw new Error(
      `propose_events with confirmation_mode 'accept_all' requires at least 1 event (got 0).`,
    );
  }
  const callId = crypto.randomUUID();
  const entries: BatchProposalEntry[] = rawEvents.map((e, i) => {
    const sanitized = sanitizeProposalInput(e);
    return {
      id: `${callId}-${i}`,
      action: toAction(sanitized),
      event: toCalendarEvent(sanitized),
    };
  });

  // Group entries by action so mixed batches (delete + create + update)
  // become separate batch proposals with homogeneous actions.
  const grouped = new Map<string, BatchProposalEntry[]>();
  for (const entry of entries) {
    const existing = grouped.get(entry.action);
    if (existing) existing.push(entry);
    else grouped.set(entry.action, [entry]);
  }

  for (const actionEntries of grouped.values()) {
    emit({
      event: SSEEventType.BatchProposal,
      data: { batchId: crypto.randomUUID(), entries: actionEntries },
    });
  }

  return Promise.resolve('Proposal shown to user.');
}
