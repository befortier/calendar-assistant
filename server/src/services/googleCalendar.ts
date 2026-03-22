import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import type { Config } from '../env-schema';

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
}

export interface FreeSlot {
  start: string;
  end: string;
}

export interface BusyBlock {
  start: string;
  end: string;
}

export interface FreeBusyResult {
  [email: string]: BusyBlock[];
}

export interface CreateEventInput {
  title: string;
  start: string;
  end: string;
  attendees?: string[];
  description?: string;
  location?: string;
}

export interface UpdateEventInput {
  title?: string;
  start?: string;
  end?: string;
  attendees?: string[];
  description?: string;
  location?: string;
}

export class GoogleCalendarService {
  constructor(private readonly calendar: calendar_v3.Calendar) {}

  async getEvents(start: Date, end: Date): Promise<CalendarEvent[]> {
    const res = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (res.data.items ?? [])
      .map(normalizeEvent)
      .filter((e): e is CalendarEvent => e !== null);
  }

  async getFreeSlots(start: Date, end: Date): Promise<FreeSlot[]> {
    const events = await this.getEvents(start, end);
    // All-day events have no wall-clock start/end, so exclude them from slot computation
    const timedEvents = events.filter((e) => !e.allDay);

    // Merge overlapping intervals
    const intervals = timedEvents
      .map((e) => ({ start: new Date(e.start).getTime(), end: new Date(e.end).getTime() }))
      .sort((a, b) => a.start - b.start);

    const merged: Array<{ start: number; end: number }> = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (last && interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
      } else {
        merged.push({ ...interval });
      }
    }

    // Find gaps between merged intervals within [start, end]
    const slots: FreeSlot[] = [];
    let cursor = start.getTime();

    for (const block of merged) {
      if (cursor < block.start) {
        slots.push({ start: new Date(cursor).toISOString(), end: new Date(block.start).toISOString() });
      }
      cursor = Math.max(cursor, block.end);
    }

    if (cursor < end.getTime()) {
      slots.push({ start: new Date(cursor).toISOString(), end: end.toISOString() });
    }

    return slots;
  }

  async getFreeBusy(emails: string[], start: Date, end: Date): Promise<FreeBusyResult> {
    const res = await this.calendar.freebusy.query({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      items: emails.map((id) => ({ id })),
    });
    const calendars = res.data.calendars ?? {};
    return Object.fromEntries(
      emails.map((email) => [
        email,
        (calendars[email]?.busy ?? []).map((b) => ({ start: b.start ?? '', end: b.end ?? '' })),
      ]),
    );
  }

  async createEvent(input: CreateEventInput): Promise<CalendarEvent> {
    const res = await this.calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: input.title,
        start: { dateTime: input.start },
        end: { dateTime: input.end },
        attendees: input.attendees?.map((email) => ({ email })),
        description: input.description,
        location: input.location,
      },
    });
    const event = normalizeEvent(res.data);
    if (!event) throw new Error('createEvent: Google returned an event with missing start/end');
    return event;
  }

  async updateEvent(eventId: string, updates: UpdateEventInput): Promise<CalendarEvent> {
    // Use patch (not events.update) so only provided fields are sent — unspecified fields remain unchanged
    const requestBody: calendar_v3.Schema$Event = {};
    if (updates.title       !== undefined) requestBody.summary     = updates.title;
    if (updates.start       !== undefined) requestBody.start       = { dateTime: updates.start };
    if (updates.end         !== undefined) requestBody.end         = { dateTime: updates.end };
    if (updates.attendees   !== undefined) requestBody.attendees   = updates.attendees.map((email) => ({ email }));
    if (updates.description !== undefined) requestBody.description = updates.description;
    if (updates.location    !== undefined) requestBody.location    = updates.location;

    const res = await this.calendar.events.patch({ calendarId: 'primary', eventId, requestBody });
    const event = normalizeEvent(res.data);
    if (!event) throw new Error('updateEvent: Google returned an event with missing start/end');
    return event;
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.calendar.events.delete({ calendarId: 'primary', eventId });
  }
}

export function createGoogleCalendarService(
  accessToken: string,
  refreshToken: string,
  config: Pick<Config, 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET'>,
  onTokenRefresh?: (tokens: { accessToken: string; refreshToken?: string }) => void,
): GoogleCalendarService {
  const auth = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

  if (onTokenRefresh) {
    auth.on('tokens', (tokens) => {
      if (tokens.access_token) {
        onTokenRefresh({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? undefined,
        });
      }
    });
  }

  return new GoogleCalendarService(google.calendar({ version: 'v3', auth }));
}

function normalizeEvent(event: calendar_v3.Schema$Event): CalendarEvent | null {
  const allDay = Boolean(event.start?.date && !event.start?.dateTime);
  const start = (allDay ? event.start?.date : event.start?.dateTime) ?? '';
  const end = (allDay ? event.end?.date : event.end?.dateTime) ?? '';
  if (!start || !end) return null;
  return {
    id: event.id ?? '',
    title: event.summary ?? '',
    start,
    end,
    allDay,
    location: event.location ?? undefined,
    description: event.description ?? undefined,
  };
}
