import type { ToolDefinition } from './types';

export const calendarTools: ToolDefinition[] = [
  {
    name: 'get_events',
    description: `Lists the user's calendar events within a time range. Returns an array of events with id, title, start, end, allDay, attendees, location, and description. Use the id field if you need to update or delete an event later.`,
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Start of range (ISO 8601)' },
        end: { type: 'string', description: 'End of range (ISO 8601)' },
      },
      required: ['start', 'end'],
    },
  },
  {
    name: 'get_freebusy',
    description: `Checks busy/free windows for one or more people within a time range. Returns an object keyed by email with accessible (boolean), status, busy blocks, and free windows. If accessible is false, the calendar could not be read — do not assume that person is free.`,
    inputSchema: {
      type: 'object',
      properties: {
        emails: { type: 'array', items: { type: 'string' }, description: 'Email addresses to query.' },
        start: { type: 'string', description: 'Start of range (ISO 8601)' },
        end: { type: 'string', description: 'End of range (ISO 8601)' },
      },
      required: ['emails', 'start', 'end'],
    },
  },
  {
    name: 'propose_event',
    description: `Shows an interactive event card the user can accept or decline. This is display-only — it does not create or modify anything. Call once per option when presenting multiple choices.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Event ID (empty string for new events)' },
        title: { type: 'string', description: 'Event title' },
        start: { type: 'string', description: 'Start datetime (ISO 8601)' },
        end: { type: 'string', description: 'End datetime (ISO 8601)' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee emails' },
      },
      required: ['id', 'title', 'start', 'end', 'attendees'],
    },
  },
  {
    name: 'create_event',
    description: `Creates a new event on the user's primary calendar. Only call after the user has confirmed. Returns the created event with its id.`,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        start: { type: 'string', description: 'Start datetime (ISO 8601)' },
        end: { type: 'string', description: 'End datetime (ISO 8601)' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee emails' },
        description: { type: 'string', description: 'Event description' },
        location: { type: 'string', description: 'Event location' },
        recurrence: { type: 'array', items: { type: 'string' }, description: 'Recurrence rules in RFC 5545 RRULE format (e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO"])' },
      },
      required: ['title', 'start', 'end'],
    },
  },
  {
    name: 'update_event',
    description: `Updates an existing event. Partial patch — only provided fields change. Only call after the user has confirmed. The id must come from a prior get_events or create_event result.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Event ID from get_events or create_event' },
        title: { type: 'string', description: 'New title' },
        start: { type: 'string', description: 'New start datetime (ISO 8601)' },
        end: { type: 'string', description: 'New end datetime (ISO 8601)' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Replacement attendee list' },
        description: { type: 'string', description: 'New description' },
        location: { type: 'string', description: 'New location' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_event',
    description: `Deletes an event. Irreversible. Only call after the user has confirmed. The id must come from a prior get_events or create_event result.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Event ID from get_events or create_event' },
      },
      required: ['id'],
    },
  },
];
