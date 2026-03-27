import type Anthropic from '@anthropic-ai/sdk';
import type { GoogleCalendarService, CreateEventInput, UpdateEventInput } from './googleCalendar';
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

/** Shared event properties used across propose_event, create_event, update_event, delete_event. */
const eventProperties = {
  id: { type: 'string', description: 'Event ID from get_events or create_event (empty string for new events)' },
  title: { type: 'string', description: 'Event title' },
  start: { type: 'string', description: 'Start datetime (ISO 8601 with timezone offset)' },
  end: { type: 'string', description: 'End datetime (ISO 8601 with timezone offset)' },
  attendees: { type: 'array', items: { type: 'string' }, description: 'Email addresses of attendees' },
  description: { type: 'string', description: 'Event description' },
  location: { type: 'string', description: 'Event location' },
} as const;

export const calendarTools: Anthropic.Tool[] = [
  {
    name: 'get_events',
    description: `Lists calendar events the authenticated user can already access within a time range.
Only reads calendars the user has explicit permission to view — this does NOT expand permissions or look up other people's event details by email.
Do not use this to check another person's availability; use get_freebusy for that.
Returns an array of events, each with: id, title, start (ISO 8601), end (ISO 8601), allDay, attendees (email array), location, description.
The id field is needed if you later call update_event or delete_event.`,
    input_schema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Start of range (ISO 8601 datetime with timezone offset)' },
        end: { type: 'string', description: 'End of range (ISO 8601 datetime with timezone offset)' },
      },
      required: ['start', 'end'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'get_freebusy',
    description: `Queries busy blocks and free windows for one or more calendar users within a time range.
Always include the authenticated user's email in the list.
Returns an object keyed by email. Each entry has:
  - accessible (boolean): whether the calendar could be read
  - status: 'ok' | 'forbidden' | 'not_found' | 'unknown'
  - busy: array of { start, end } blocks
  - free: array of { start, end } windows
If accessible is false, tell the user you cannot see that person's calendar and suggest they send a calendar invite or ask directly. An inaccessible calendar always returns an empty busy array — do NOT interpret that as "free".
Use this to find overlapping availability before scheduling a meeting.`,
    input_schema: {
      type: 'object',
      properties: {
        emails: {
          type: 'array',
          items: { type: 'string' },
          description: "Email addresses to query. Always include the authenticated user's email.",
        },
        start: { type: 'string', description: 'Start of range (ISO 8601 datetime with timezone offset)' },
        end: { type: 'string', description: 'End of range (ISO 8601 datetime with timezone offset)' },
      },
      required: ['emails', 'start', 'end'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'propose_event',
    description: `Presents an event as an interactive card for the user to accept or decline.
Use this to propose one or more event options BEFORE creating them. Call MULTIPLE TIMES in a single response for multiple options.
After the user picks one, call create_event with those details.
For update/delete proposals, include the existing event id so the user sees what will change.
This tool is display-only — it does NOT create, modify, or delete anything.`,
    input_schema: {
      type: 'object',
      properties: eventProperties,
      required: ['id', 'title', 'start', 'end'],
    },
  },
  {
    name: 'create_event',
    description: `Creates a new event on the authenticated user's primary calendar.
Only call this after the user has confirmed — either by clicking accept on a propose_event card, or by saying "yes", "go ahead", etc.
Returns the created event including its id.`,
    input_schema: {
      type: 'object',
      properties: eventProperties,
      required: ['id', 'title', 'start', 'end'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'update_event',
    description: `Updates an existing event on the authenticated user's calendar. Uses partial patch — only provided fields are changed, omitted fields stay as-is.
Only call this after the user has confirmed. The id MUST come from a prior get_events or create_event result. Never invent or guess an event ID.
Returns the updated event.`,
    input_schema: {
      type: 'object',
      properties: eventProperties,
      required: ['id'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'delete_event',
    description: `Deletes an event from the authenticated user's calendar. This action is irreversible.
Only call this after the user has confirmed. The id MUST come from a prior get_events or create_event result. Never invent or guess an event ID.`,
    input_schema: {
      type: 'object',
      properties: eventProperties,
      required: ['id'],
      additionalProperties: false,
    },
    strict: true,
  },
];

export type ToolName = (typeof calendarTools)[number]['name'];

export async function dispatchTool(
  name: ToolName,
  input: Record<string, unknown>,
  service: GoogleCalendarService,
): Promise<string> {
  switch (name) {
    case 'get_events': {
      const start = asDate(input.start, 'start');
      const end = asDate(input.end, 'end');
      const events = await service.getEvents(start, end);
      return JSON.stringify(events);
    }

    case 'get_freebusy': {
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

    case 'create_event': {
      const createInput: CreateEventInput = {
        title: asString(input.title, 'title'),
        start: asString(input.start, 'start'),
        end: asString(input.end, 'end'),
        attendees: input.attendees != null ? asStringArray(input.attendees, 'attendees') : undefined,
        description: input.description != null ? asString(input.description, 'description') : undefined,
        location: input.location != null ? asString(input.location, 'location') : undefined,
      };
      const event = await service.createEvent(createInput);
      return JSON.stringify(event);
    }

    case 'update_event': {
      const id = asString(input.id, 'id');
      const updates: UpdateEventInput = {};
      if (input.title != null) updates.title = asString(input.title, 'title');
      if (input.start != null) updates.start = asString(input.start, 'start');
      if (input.end != null) updates.end = asString(input.end, 'end');
      if (input.attendees != null) updates.attendees = asStringArray(input.attendees, 'attendees');
      if (input.description != null) updates.description = asString(input.description, 'description');
      if (input.location != null) updates.location = asString(input.location, 'location');
      const event = await service.updateEvent(id, updates);
      return JSON.stringify(event);
    }

    case 'delete_event': {
      const id = asString(input.id, 'id');
      await service.deleteEvent(id);
      return JSON.stringify({ success: true });
    }

    case 'propose_event':
      // Display-only — no dispatch. Returns the input as confirmation.
      return JSON.stringify(input);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
