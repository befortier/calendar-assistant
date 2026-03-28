import type { ToolDefinition } from './types';

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

export const calendarTools: ToolDefinition[] = [
  {
    name: 'get_events',
    description: `Lists calendar events the authenticated user can already access within a time range.
Only reads calendars the user has explicit permission to view — this does NOT expand permissions or look up other people's event details by email.
Do not use this to check another person's availability; use get_freebusy for that.
Returns an array of events, each with: id, title, start (ISO 8601), end (ISO 8601), allDay, attendees (email array), location, description.
The id field is needed if you later call update_event or delete_event.`,
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Start of range (ISO 8601 datetime with timezone offset)' },
        end: { type: 'string', description: 'End of range (ISO 8601 datetime with timezone offset)' },
      },
      required: ['start', 'end'],
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
    inputSchema: {
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
    },
    strict: true,
  },
  {
    name: 'propose_event',
    description: `Presents an event as an interactive card for the user to accept or decline.
Use this to propose event options BEFORE creating them. Call MULTIPLE TIMES in a single response (2-3 calls) for multiple time slot options — NEVER list options as plain text.
Always include the meeting title the user mentioned. Never pass an empty title.
After the user picks one, call create_event with those details.
For update/delete proposals, include the existing event id so the user sees what will change.
This tool is display-only — it does NOT create, modify, or delete anything.`,
    inputSchema: {
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
    inputSchema: {
      type: 'object',
      properties: eventProperties,
      required: ['id', 'title', 'start', 'end'],
    },
    strict: true,
  },
  {
    name: 'update_event',
    description: `Updates an existing event on the authenticated user's calendar. Uses partial patch — only provided fields are changed, omitted fields stay as-is.
Only call this after the user has confirmed. The id MUST come from a prior get_events or create_event result. Never invent or guess an event ID.
Returns the updated event.`,
    inputSchema: {
      type: 'object',
      properties: eventProperties,
      required: ['id'],
    },
    strict: true,
  },
  {
    name: 'delete_event',
    description: `Deletes an event from the authenticated user's calendar. This action is irreversible.
Only call this after the user has confirmed. The id MUST come from a prior get_events or create_event result. Never invent or guess an event ID.`,
    inputSchema: {
      type: 'object',
      properties: eventProperties,
      required: ['id'],
    },
    strict: true,
  },
];
