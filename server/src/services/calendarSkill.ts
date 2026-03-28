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

export async function dispatchTool(
  name: string,
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
        recurrence: input.recurrence != null ? asStringArray(input.recurrence, 'recurrence') : undefined,
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

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
