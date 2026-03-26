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
    name: 'create_event',
    description: `Creates a new event on the authenticated user's primary calendar.
Only call this after the user has explicitly confirmed the event details — time, title, and attendees.
Do not infer or assume confirmation from context. If unsure, ask.
Returns the created event including its id — store this id if the user may want to update or delete it later.`,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        start: { type: 'string', description: 'Start datetime (ISO 8601 with timezone offset)' },
        end: { type: 'string', description: 'End datetime (ISO 8601 with timezone offset)' },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email addresses of attendees (optional)',
        },
        description: { type: 'string', description: 'Event description (optional)' },
        location: { type: 'string', description: 'Event location (optional)' },
      },
      required: ['title', 'start', 'end'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'update_event',
    description: `Updates an existing event on the authenticated user's calendar. Uses partial patch — only provided fields are changed, omitted fields stay as-is.
Only call this after the user has explicitly confirmed what to change.
The event_id MUST come from a prior get_events or create_event result in this conversation. Never invent or guess an event ID.
Returns the updated event.`,
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'ID from a prior get_events or create_event result' },
        title: { type: 'string', description: 'New title (optional)' },
        start: { type: 'string', description: 'New start datetime ISO 8601 (optional)' },
        end: { type: 'string', description: 'New end datetime ISO 8601 (optional)' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Replacement attendee list (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
        location: { type: 'string', description: 'New location (optional)' },
      },
      required: ['event_id'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'delete_event',
    description: `Deletes an event from the authenticated user's calendar. This action is irreversible.
Only call this after the user has explicitly confirmed they want to delete the event.
The event_id MUST come from a prior get_events or create_event result in this conversation. Never invent or guess an event ID.`,
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'ID from a prior get_events or create_event result' },
      },
      required: ['event_id'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'propose_options',
    description: `Presents the user with a set of time slot options to choose from. Use this INSTEAD of listing times in text.
When the user asks to schedule something and you've found available slots, call this tool with the event details and options.
Each option has the same title, attendees, etc. but different start/end times.
The user will pick one option in the UI. After they pick, call create_event with the chosen details.
If the user says "any work" or similar, just pick the best one and call create_event directly.`,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title (same for all options)' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee emails (same for all options)' },
        description: { type: 'string', description: 'Event description (optional)' },
        location: { type: 'string', description: 'Event location (optional)' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              start: { type: 'string', description: 'Start datetime (ISO 8601)' },
              end: { type: 'string', description: 'End datetime (ISO 8601)' },
            },
            required: ['start', 'end'],
            additionalProperties: false,
          },
          description: 'Time slot options (2-5 recommended)',
        },
      },
      required: ['title', 'options'],
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
      const event_id = asString(input.event_id, 'event_id');
      const updates: UpdateEventInput = {};
      if (input.title != null) updates.title = asString(input.title, 'title');
      if (input.start != null) updates.start = asString(input.start, 'start');
      if (input.end != null) updates.end = asString(input.end, 'end');
      if (input.attendees != null) updates.attendees = asStringArray(input.attendees, 'attendees');
      if (input.description != null) updates.description = asString(input.description, 'description');
      if (input.location != null) updates.location = asString(input.location, 'location');
      const event = await service.updateEvent(event_id, updates);
      return JSON.stringify(event);
    }

    case 'delete_event': {
      const event_id = asString(input.event_id, 'event_id');
      await service.deleteEvent(event_id);
      return JSON.stringify({ success: true });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
