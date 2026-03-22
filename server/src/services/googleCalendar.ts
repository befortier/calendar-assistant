import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import type { Config } from '../env-schema';

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  attendees?: string[];
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

export interface CalendarAccessError {
  domain: string;
  reason: string;
}

export interface CalendarFreeBusy {
  busy: BusyBlock[];
  errors?: CalendarAccessError[];
}

export type FreeBusyResult = Record<string, CalendarFreeBusy>;

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
  private readonly calendarId = 'primary';

  constructor(private readonly calendar: calendar_v3.Calendar) {}

  async getEvents(start: Date, end: Date): Promise<CalendarEvent[]> {
    const res = await this.calendar.events.list({
      calendarId: this.calendarId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (res.data.items ?? [])
      .map(normalizeEvent)
      .filter((e): e is CalendarEvent => e !== null);
  }

  async getFreeBusy(emails: string[], start: Date, end: Date): Promise<FreeBusyResult> {
    const res = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        items: emails.map((id) => ({ id })),
      },
    });
    const calendars = res.data.calendars ?? {};
    return Object.fromEntries(
      emails.map((email) => {
        const entry = calendars[email];
        const busy = (entry?.busy ?? []).map((b) => ({ start: b.start ?? '', end: b.end ?? '' }));
        const errors = entry?.errors?.map((e) => ({ domain: e.domain ?? '', reason: e.reason ?? '' }));
        return [email, errors?.length ? { busy, errors } : { busy }];
      }),
    );
  }

  async createEvent(input: CreateEventInput): Promise<CalendarEvent> {
    const res = await this.calendar.events.insert({
      calendarId: this.calendarId,
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

    const res = await this.calendar.events.patch({ calendarId: this.calendarId, eventId, requestBody });
    const event = normalizeEvent(res.data);
    if (!event) throw new Error('updateEvent: Google returned an event with missing start/end');
    return event;
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.calendar.events.delete({ calendarId: this.calendarId, eventId });
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

// ---------------------------------------------------------------------------
// Pure utility — invert a list of busy blocks into free windows within a range.
// Use getFreeBusy([userEmail], start, end) to get busy blocks for the current
// user, then pass the result through invertBusy to obtain their free slots.
// ---------------------------------------------------------------------------
export function invertBusy(busy: BusyBlock[], start: Date, end: Date): FreeSlot[] {
  const intervals = busy
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .sort((a, b) => a.start - b.start);

  // Merge overlapping/touching intervals
  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  // Find gaps between merged blocks within [start, end]
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

function normalizeEvent(event: calendar_v3.Schema$Event): CalendarEvent | null {
  const allDay = Boolean(event.start?.date && !event.start?.dateTime);
  const start = (allDay ? event.start?.date : event.start?.dateTime) ?? '';
  const end = (allDay ? event.end?.date : event.end?.dateTime) ?? '';
  if (!start || !end) return null;
  const attendees = event.attendees?.map((a) => a.email).filter((e): e is string => Boolean(e));
  return {
    id: event.id ?? '',
    title: event.summary ?? '',
    start,
    end,
    allDay,
    attendees: attendees?.length ? attendees : undefined,
    location: event.location ?? undefined,
    description: event.description ?? undefined,
  };
}
