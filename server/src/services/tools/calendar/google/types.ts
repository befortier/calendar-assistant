/**
 * Represents an attendee on a calendar event, with their email and RSVP status.
 */
export interface AttendeeInfo {
  /** The attendee's email address. */
  email: string;
  /**
   * The attendee's response to the invitation.
   * - `accepted` — confirmed attendance
   * - `declined` — declined the invitation
   * - `tentative` — marked as maybe
   * - `needsAction` — no response yet (default for newly invited attendees)
   */
  responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
}

/**
 * A reminder that fires before an event via a given delivery method.
 */
export interface EventReminder {
  /** How the reminder is delivered: a push notification (`popup`) or an email (`email`). */
  method: 'email' | 'popup';
  /** How many minutes before the event start the reminder should fire. */
  minutes: number;
}

/**
 * A normalised representation of a Google Calendar event.
 */
export interface CalendarEvent {
  /** The event's stable Google Calendar ID (may include a recurrence instance suffix). */
  id: string;
  /** The event title / summary. */
  title: string;
  /**
   * ISO 8601 start datetime string (e.g. `2024-06-01T09:00:00-07:00`) for timed events,
   * or a date string (`2024-06-01`) for all-day events.
   */
  start: string;
  /**
   * ISO 8601 end datetime string or date string, matching the format of `start`.
   */
  end: string;
  /** `true` when the event spans full calendar days with no specific time. */
  allDay: boolean;
  /** List of invited attendees, omitted when there are none. */
  attendees?: AttendeeInfo[];
  /** Physical or virtual location string, if set on the event. */
  location?: string;
  /** Rich-text or plain-text event body/notes. */
  description?: string;
  /** Raw RRULE / EXDATE recurrence strings (Google Calendar format). */
  recurrence?: string[];
  /** Custom reminder overrides; `undefined` means the calendar's default reminders apply. */
  reminders?: EventReminder[];
  /** Google Meet video-call URL, if a conference was attached to the event. */
  meetLink?: string;
}

/**
 * Metadata for a single calendar in the user's calendar list.
 */
export interface CalendarInfo {
  /** The calendar's unique identifier (email-like for personal calendars). */
  id: string;
  /** Display name — prefers `summaryOverride` set by the user over the calendar's own summary. */
  summary: string;
  /** Background colour hex string (e.g. `#9E69AF`) assigned to this calendar, if set. */
  backgroundColor?: string;
  /** `true` for the user's primary calendar. */
  primary: boolean;
}

/**
 * A continuous window of free time within a queried range.
 */
export interface FreeSlot {
  /** ISO 8601 start of the free window. */
  start: string;
  /** ISO 8601 end of the free window. */
  end: string;
}

/**
 * A block of time during which a calendar is reported as busy.
 */
export interface BusyBlock {
  /** ISO 8601 start of the busy block. */
  start: string;
  /** ISO 8601 end of the busy block. */
  end: string;
}

/**
 * An access error returned by the Google free/busy API for a specific calendar.
 */
export interface CalendarAccessError {
  /** The error domain reported by Google (e.g. `calendar.google.com`). */
  domain: string;
  /**
   * Machine-readable reason code.
   * - `notFound` — calendar does not exist or the user has no visibility
   * - `authError` — the OAuth token lacks permission to read this calendar
   */
  reason: string;
}

export type CalendarAccessStatus = 'ok' | 'forbidden' | 'not_found' | 'unknown';

export interface CalendarFreeBusy {
  accessible: boolean;
  status: CalendarAccessStatus;
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
  recurrence?: string[];
  reminders?: EventReminder[];
  allDay?: boolean;
  timeZone?: string;
}

export interface UpdateEventInput {
  title?: string;
  start?: string;
  end?: string;
  attendees?: string[];
  description?: string;
  location?: string;
  reminders?: EventReminder[];
  allDay?: boolean;
}

export type RecurrenceScope = 'this' | 'this_and_following' | 'all';
