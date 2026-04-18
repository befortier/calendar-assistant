import type { ToolDefinition } from '../../agent/types';

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
    name: 'propose_events',
    description: `Shows event proposal card(s) the user can accept or decline. Pick one confirmation_mode and pack every related event into a single call:
- 'single': one event card. events must contain exactly one entry.
- 'choose_one': mutually-exclusive alternatives; accepting one auto-declines the rest. Requires events.length >= 2.
- 'accept_all': a set of changes meant to go through together. Actions can mix (create/update/delete). Requires events.length >= 1.

Never call this tool more than once for related proposals — combine them into one call with the right mode.`,
    inputSchema: {
      type: 'object',
      properties: {
        confirmation_mode: {
          type: 'string',
          enum: ['single', 'choose_one', 'accept_all'],
          description: "How the user should confirm these events. 'single' = one card; 'choose_one' = pick one of N alternatives; 'accept_all' = review and accept the whole set.",
        },
        events: {
          type: 'array',
          description: 'The event(s) being proposed. See confirmation_mode for required length.',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['create', 'update', 'delete'], description: 'What this proposal is for' },
              id: { type: 'string', description: 'Event ID (empty string for new events)' },
              title: { type: 'string', description: 'Event title' },
              start: { type: 'string', description: 'Start datetime (ISO 8601)' },
              end: { type: 'string', description: 'End datetime (ISO 8601)' },
              attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee emails' },
              recurrence: { type: 'array', items: { type: 'string' }, description: 'Recurrence rules in RFC 5545 RRULE format (e.g. ["RRULE:FREQ=WEEKLY;BYDAY=TU"]). Include when proposing a recurring event.' },
            },
            required: ['action', 'id', 'title', 'start', 'end', 'attendees'],
          },
        },
      },
      required: ['confirmation_mode', 'events'],
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
        reminders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              method: { type: 'string', description: '"email" or "popup"' },
              minutes: { type: 'number', description: 'Minutes before event (0-40320)' },
            },
          },
          description: 'Custom reminders. Omit to use calendar defaults.',
        },
        allDay: { type: 'boolean', description: 'True for all-day events (start/end should be YYYY-MM-DD)' },
      },
      required: ['title', 'start', 'end'],
    },
  },
  {
    name: 'update_event',
    description: `Updates an existing event. Partial patch — only provided fields change. Only call after the user has confirmed. The id must come from a prior get_events or create_event result. For recurring events, recurrence_scope must be set — ask the user which scope they want before calling.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Event ID from get_events or create_event' },
        recurrence_scope: {
          type: 'string',
          enum: ['this', 'all'],
          description: 'For recurring events: "this" updates only this instance, "all" updates the entire series. Omit for non-recurring events.',
        },
        title: { type: 'string', description: 'New title' },
        start: { type: 'string', description: 'New start datetime (ISO 8601)' },
        end: { type: 'string', description: 'New end datetime (ISO 8601)' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Replacement attendee list' },
        description: { type: 'string', description: 'New description' },
        location: { type: 'string', description: 'New location' },
        reminders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              method: { type: 'string', description: '"email" or "popup"' },
              minutes: { type: 'number', description: 'Minutes before event (0-40320)' },
            },
          },
          description: 'Custom reminders. Omit to use calendar defaults.',
        },
        allDay: { type: 'boolean', description: 'True for all-day events (start/end should be YYYY-MM-DD)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_event',
    description: `Deletes an event. Irreversible. Only call after the user has confirmed. The id must come from a prior get_events or create_event result. For recurring events, recurrence_scope must be set — ask the user which scope they want before calling.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Event ID from get_events or create_event' },
        recurrence_scope: {
          type: 'string',
          enum: ['this', 'this_and_following', 'all'],
          description: 'For recurring events: "this" deletes only this instance, "this_and_following" deletes this and all following instances, "all" deletes the entire series. Omit for non-recurring events.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_preferences',
    description: `Saves the user's preferences for future reference. Call this when the user states a preference, personal detail, or standing constraint — e.g. "I prefer morning meetings", "my office is in SF", "I have lunch blocked noon–1pm", "never schedule me before 9am". Write the full updated preferences document (replaces the previous version). Keep it as freeform markdown notes.`,
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The full updated preferences document (markdown).' },
      },
      required: ['content'],
    },
  },
];
