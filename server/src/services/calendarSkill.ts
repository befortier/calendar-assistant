import type { GoogleCalendarService, CreateEventInput, UpdateEventInput, EventReminder, RecurrenceScope } from './googleCalendar';
import { invertBusy } from './googleCalendar';

function asString(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new Error(`dispatchTool: expected string for '${field}', got ${typeof v}`);
  return v;
}

function asDate(v: unknown, field: string): Date {
  const s = asString(v, field);
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error(`dispatchTool: invalid ISO 8601 date for '${field}'`);
  return d;
}

function asStringArray(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string'))
    throw new Error(`dispatchTool: expected string[] for '${field}'`);
  return v as string[];
}

const VALID_RECURRENCE_SCOPES: RecurrenceScope[] = ['this', 'this_and_following', 'all'];

function asRecurrenceScope(v: unknown): RecurrenceScope {
  const raw = asString(v, 'recurrence_scope');
  if (!(VALID_RECURRENCE_SCOPES as string[]).includes(raw))
    throw new Error(`dispatchTool: invalid recurrence_scope '${raw}'`);
  return raw as RecurrenceScope;
}

function asReminders(v: unknown, field: string): EventReminder[] {
  if (!Array.isArray(v)) throw new Error(`dispatchTool: expected array for '${field}'`);
  return v.map((r, i) => {
    if (typeof r !== 'object' || r === null)
      throw new Error(`dispatchTool: expected object at ${field}[${i}]`);
    const obj = r as Record<string, unknown>;
    if (typeof obj.minutes !== 'number')
      throw new Error(`dispatchTool: expected number for '${field}[${i}].minutes'`);
    return {
      method: asString(obj.method, `${field}[${i}].method`) as 'email' | 'popup',
      minutes: obj.minutes,
    };
  });
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
    throw new Error("dispatchTool: this_and_following is not supported for update_event");
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
  const scope = input.recurrence_scope != null ? asRecurrenceScope(input.recurrence_scope) : undefined;
  await service.deleteEvent(id, scope);
  return JSON.stringify({ success: true });
}

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  service: GoogleCalendarService,
  userTimeZone?: string,
): Promise<string> {
  switch (name) {
    case 'get_events':    return handleGetEvents(input, service);
    case 'get_freebusy':  return handleGetFreebusy(input, service);
    case 'create_event':  return handleCreateEvent(input, service, userTimeZone);
    case 'update_event':  return handleUpdateEvent(input, service);
    case 'delete_event':  return handleDeleteEvent(input, service);
    default:              throw new Error(`Unknown tool: ${name}`);
  }
}
