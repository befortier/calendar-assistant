import type { calendar_v3 } from 'googleapis';
import { randomUUID } from 'crypto';
import type {
  CalendarEvent,
  CalendarInfo,
  CalendarAccessStatus,
  FreeBusyResult,
  CreateEventInput,
  UpdateEventInput,
  RecurrenceScope,
} from './types';
import { normalizeEvent as defaultNormalizeEvent, resolveAccessStatus as defaultResolveAccessStatus } from './mappers';
import { stripRecurrenceSuffix as defaultStripRecurrenceSuffix, truncateRruleUntil as defaultTruncateRruleUntil } from './recurrence';
import { withRetry } from './retry';

export interface GoogleCalendarDeps {
  normalizeEvent: (event: calendar_v3.Schema$Event) => CalendarEvent | null;
  resolveAccessStatus: (reason: string) => CalendarAccessStatus;
  stripRecurrenceSuffix: (eventId: string) => string;
  truncateRruleUntil: (rrule: string, instanceEventId: string) => string;
  retry: <T>(fn: () => Promise<T>) => Promise<T>;
}

const defaultDeps: GoogleCalendarDeps = {
  normalizeEvent: defaultNormalizeEvent,
  resolveAccessStatus: defaultResolveAccessStatus,
  stripRecurrenceSuffix: defaultStripRecurrenceSuffix,
  truncateRruleUntil: defaultTruncateRruleUntil,
  retry: (fn) => withRetry(fn),
};

export class GoogleCalendarService {
  private readonly deps: GoogleCalendarDeps;

  constructor(
    private readonly calendar: calendar_v3.Calendar,
    private readonly calendarId = 'primary',
    deps?: Partial<GoogleCalendarDeps>,
  ) {
    this.deps = { ...defaultDeps, ...deps };
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    const res = await this.deps.retry(() => this.calendar.calendarList.list({ minAccessRole: 'reader' }));
    return (res.data.items ?? [])
      .map((item) => ({
        id: item.id ?? '',
        summary: item.summaryOverride ?? item.summary ?? '',
        backgroundColor: item.backgroundColor ?? undefined,
        primary: item.primary ?? false,
      }))
      .filter((c) => c.id !== '');
  }

  async getEvents(start: Date, end: Date): Promise<CalendarEvent[]> {
    const res = await this.deps.retry(() => this.calendar.events.list({
      calendarId: this.calendarId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    }));

    return (res.data.items ?? [])
      .map(this.deps.normalizeEvent)
      .filter((e): e is CalendarEvent => e !== null);
  }

  async getFreeBusy(emails: string[], start: Date, end: Date): Promise<FreeBusyResult> {
    const res = await this.deps.retry(() => this.calendar.freebusy.query({
      requestBody: {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        items: emails.map((id) => ({ id })),
      },
    }));
    const calendars = res.data.calendars ?? {};
    return Object.fromEntries(
      emails.map((email) => {
        const entry = calendars[email] as { busy?: { start?: string; end?: string }[]; errors?: { domain?: string; reason?: string }[] } | undefined;
        const busy = (entry?.busy ?? []).map((b) => ({ start: b.start ?? '', end: b.end ?? '' }));
        const errors = entry?.errors?.map((e) => ({ domain: e.domain ?? '', reason: e.reason ?? '' }));
        if (errors?.length) {
          const status = this.deps.resolveAccessStatus(errors[0].reason);
          return [email, { accessible: false, status, busy, errors }];
        }
        return [email, { accessible: true, status: 'ok' as const, busy }];
      }),
    ) as FreeBusyResult;
  }

  async createEvent(input: CreateEventInput): Promise<CalendarEvent> {
    const timeZone = input.timeZone;
    const requestBody: calendar_v3.Schema$Event = {
      summary: input.title,
      start: input.allDay ? { date: input.start } : { dateTime: input.start, ...(timeZone && { timeZone }) },
      end: input.allDay ? { date: input.end } : { dateTime: input.end, ...(timeZone && { timeZone }) },
      attendees: input.attendees?.map((email) => ({ email })),
      description: input.description,
      location: input.location,
      recurrence: input.recurrence,
      reminders: input.reminders
        ? { useDefault: false, overrides: input.reminders }
        : undefined,
    };

    if (input.attendees?.length) {
      requestBody.conferenceData = {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const res = await this.deps.retry(() => this.calendar.events.insert({
      calendarId: this.calendarId,
      requestBody,
      ...(requestBody.conferenceData ? { conferenceDataVersion: 1 } : {}),
    }));
    const event = this.deps.normalizeEvent(res.data);
    if (!event) throw new Error('createEvent: Google returned an event with missing start/end');
    return event;
  }

  async updateEvent(eventId: string, updates: UpdateEventInput, scope?: RecurrenceScope): Promise<CalendarEvent> {
    // Use patch (not events.update) so only provided fields are sent — unspecified fields remain unchanged
    const requestBody: calendar_v3.Schema$Event = {};
    if (updates.title       !== undefined) requestBody.summary     = updates.title;
    if (updates.start       !== undefined) requestBody.start       = updates.allDay ? { date: updates.start } : { dateTime: updates.start };
    if (updates.end         !== undefined) requestBody.end         = updates.allDay ? { date: updates.end } : { dateTime: updates.end };
    if (updates.attendees   !== undefined) requestBody.attendees   = updates.attendees.map((email) => ({ email }));
    if (updates.description !== undefined) requestBody.description = updates.description;
    if (updates.location    !== undefined) requestBody.location    = updates.location;
    if (updates.reminders   !== undefined) requestBody.reminders   = { useDefault: false, overrides: updates.reminders };

    if (scope === 'this_and_following' && !eventId.match(/_\d{8}T\d{6}Z$/)) {
      throw new Error(`updateEvent: this_and_following requires an instance event ID (got '${eventId}')`);
    }

    // 'all' and 'this_and_following' both target the master event (series-level patch).
    // 'this' or no scope targets the instance ID directly.
    const targetId = (scope === 'all' || scope === 'this_and_following')
      ? this.deps.stripRecurrenceSuffix(eventId)
      : eventId;

    const res = await this.deps.retry(() => this.calendar.events.patch({ calendarId: this.calendarId, eventId: targetId, requestBody }));
    const event = this.deps.normalizeEvent(res.data);
    if (!event) throw new Error('updateEvent: Google returned an event with missing start/end');
    return event;
  }

  async deleteEvent(eventId: string, scope?: RecurrenceScope): Promise<void> {
    if (scope === 'all') {
      await this.deps.retry(() => this.calendar.events.delete({ calendarId: this.calendarId, eventId: this.deps.stripRecurrenceSuffix(eventId) }));
      return;
    }

    if (scope === 'this_and_following') {
      if (!eventId.match(/_\d{8}T\d{6}Z$/)) {
        throw new Error(`deleteEvent: this_and_following requires an instance event ID (got '${eventId}')`);
      }
      const masterId = this.deps.stripRecurrenceSuffix(eventId);
      const masterRes = await this.deps.retry(() => this.calendar.events.get({ calendarId: this.calendarId, eventId: masterId }));
      const recurrence = (masterRes.data.recurrence ?? []).map((rule) =>
        rule.startsWith('RRULE:') ? this.deps.truncateRruleUntil(rule, eventId) : rule,
      );
      await this.deps.retry(() => this.calendar.events.patch({ calendarId: this.calendarId, eventId: masterId, requestBody: { recurrence } }));
      return;
    }

    // 'this' or no scope: delete the instance (or single event) as-is
    await this.deps.retry(() => this.calendar.events.delete({ calendarId: this.calendarId, eventId }));
  }
}
