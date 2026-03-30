import type { GoogleCalendarService, CreateEventInput, UpdateEventInput, RecurrenceScope } from '../../googleCalendar';
import type { CalendarEvent } from '../../googleCalendar';
import type { SSEEmitter, BatchProposalEntry } from '../../sse';
import { SSEEventType } from '../../sse';
import { invertBusy } from '../../calendarAlgorithms';
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
  userTimeZone?: string,
  emit?: SSEEmitter,
): CalendarToolDispatcher {
  return { dispatch: (name, input) => dispatchTool(name, input, service, userTimeZone, emit) };
}

// ---------------------------------------------------------------------------
// Internal handlers — not exported; validation via llmInputValidation helpers
// ---------------------------------------------------------------------------

async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  service: GoogleCalendarService,
  userTimeZone?: string,
  emit?: SSEEmitter,
): Promise<string> {
  switch (name) {
    case 'get_events':              return handleGetEvents(input, service);
    case 'get_freebusy':            return handleGetFreebusy(input, service);
    case 'create_event':            return handleCreateEvent(input, service, userTimeZone);
    case 'update_event':            return handleUpdateEvent(input, service);
    case 'delete_event':            return handleDeleteEvent(input, service);
    case 'propose_event':           return handleProposeEvent(input, emit);
    case 'propose_batched_events':  return handleProposeBatchedEvents(input, emit);
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
  };
}

function toAction(input: Record<string, unknown>): 'create' | 'update' | 'delete' {
  return (['create', 'update', 'delete'].includes(input.action as string)
    ? input.action as 'create' | 'update' | 'delete'
    : 'create');
}

function handleProposeEvent(input: Record<string, unknown>, emit: SSEEmitter | undefined): Promise<string> {
  if (emit) {
    const sanitized = sanitizeProposalInput(input);
    emit({
      event: SSEEventType.EventProposal,
      data: { id: (sanitized.id as string) || crypto.randomUUID(), action: toAction(sanitized), event: toCalendarEvent(sanitized) },
    });
  }
  return Promise.resolve('Proposal shown to user.');
}

function handleProposeBatchedEvents(input: Record<string, unknown>, emit: SSEEmitter | undefined): Promise<string> {
  if (emit) {
    const rawEvents = Array.isArray(input.events) ? (input.events as Record<string, unknown>[]) : [];
    const entries: BatchProposalEntry[] = rawEvents.map((e, i) => ({
      id: `batch-${i}`,
      action: toAction(e),
      event: toCalendarEvent(e),
    }));
    if (entries.length > 0) {
      emit({ event: SSEEventType.BatchProposal, data: { batchId: crypto.randomUUID(), entries } });
    }
  }
  return Promise.resolve('Proposal shown to user.');
}
