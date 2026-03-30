import type { calendar_v3 } from 'googleapis';
import type { AttendeeInfo, CalendarAccessStatus, CalendarEvent } from './types';

export function resolveAccessStatus(reason: string): CalendarAccessStatus {
  if (reason === 'notFound') return 'not_found';
  if (reason === 'authError') return 'forbidden';
  return 'unknown';
}

export function normalizeEvent(event: calendar_v3.Schema$Event): CalendarEvent | null {
  const allDay = Boolean(event.start?.date && !event.start?.dateTime);
  const start = (allDay ? event.start?.date : event.start?.dateTime) ?? '';
  const end = (allDay ? event.end?.date : event.end?.dateTime) ?? '';
  if (!start || !end) return null;
  const attendees = event.attendees
    ?.map((a) => ({ email: a.email!, responseStatus: a.responseStatus as AttendeeInfo['responseStatus'] }))
    .filter((a) => Boolean(a.email));
  const reminders = event.reminders?.useDefault === false
    ? event.reminders.overrides?.map((r) => ({
        method: r.method as 'email' | 'popup',
        minutes: r.minutes ?? 0,
      }))
    : undefined;
  const meetLink = event.conferenceData?.entryPoints
    ?.find((ep) => ep.entryPointType === 'video')?.uri ?? undefined;
  return {
    id: event.id ?? '',
    title: event.summary ?? '',
    start,
    end,
    allDay,
    attendees: attendees?.length ? attendees : undefined,
    location: event.location ?? undefined,
    description: event.description ?? undefined,
    recurrence: event.recurrence ?? undefined,
    reminders: reminders?.length ? reminders : undefined,
    meetLink,
  };
}
