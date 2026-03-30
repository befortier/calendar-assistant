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

/**
 * Summarises whether the authenticated user can read a given calendar.
 * - `ok`        — calendar was queried successfully
 * - `forbidden` — OAuth token lacks read permission (maps from `authError`)
 * - `not_found` — calendar does not exist or is not shared with this user (maps from `notFound`)
 * - `unknown`   — any other error reason returned by Google
 */
export type CalendarAccessStatus = 'ok' | 'forbidden' | 'not_found' | 'unknown';

/**
 * Free/busy information for a single calendar as returned by `getFreeBusy`.
 *
 * `accessible` and `status` convey the same information at different granularities:
 * - `accessible: true`  ↔ `status: 'ok'`    — the calendar was readable; `busy` is populated.
 * - `accessible: false` ↔ `status !== 'ok'` — the calendar could not be read; `errors` explains why.
 *
 * Use `accessible` for a quick boolean guard and `status` when you need to distinguish
 * error subtypes (e.g. to surface a different UI message for `forbidden` vs `not_found`).
 */
export interface CalendarFreeBusy {
  /**
   * `true` when the calendar was successfully queried and `busy` can be trusted.
   * `false` when an access error occurred — check `status` and `errors` for details.
   */
  accessible: boolean;
  /**
   * Structured access status.  Always `'ok'` when `accessible` is `true`.
   * One of `'forbidden'`, `'not_found'`, or `'unknown'` when `accessible` is `false`.
   */
  status: CalendarAccessStatus;
  /** Busy intervals reported for this calendar. Empty array when `accessible` is `false`. */
  busy: BusyBlock[];
  /** Raw error objects from Google, present only when `accessible` is `false`. */
  errors?: CalendarAccessError[];
}

/**
 * Maps each queried calendar email to its free/busy result.
 */
export type FreeBusyResult = Record<string, CalendarFreeBusy>;

/**
 * Input shape for creating a new calendar event.
 */
export interface CreateEventInput {
  /** Event title / summary. */
  title: string;
  /** ISO 8601 start datetime (or date string for all-day events). */
  start: string;
  /** ISO 8601 end datetime (or date string for all-day events). */
  end: string;
  /** List of attendee email addresses to invite. */
  attendees?: string[];
  /** Event description / notes. */
  description?: string;
  /** Physical or virtual location. */
  location?: string;
  /** RRULE / EXDATE recurrence strings (Google Calendar format). */
  recurrence?: string[];
  /** Custom reminders; omit to use the calendar default. */
  reminders?: EventReminder[];
  /** When `true`, the event is created as an all-day event using date strings. */
  allDay?: boolean;
  /** IANA time zone identifier (e.g. `America/Toronto`) applied to start/end. */
  timeZone?: string;
}

/**
 * Partial update shape for patching an existing event.
 * Only provided fields are sent to the API — omitted fields remain unchanged.
 */
export interface UpdateEventInput {
  /** New event title, if changing. */
  title?: string;
  /** New start datetime or date string, if changing. */
  start?: string;
  /** New end datetime or date string, if changing. */
  end?: string;
  /** Replacement attendee list (full replacement, not a merge). */
  attendees?: string[];
  /** New description, if changing. */
  description?: string;
  /** New location, if changing. */
  location?: string;
  /** Replacement reminder overrides, if changing. */
  reminders?: EventReminder[];
  /** Pass `true` if the updated start/end are date strings (all-day). */
  allDay?: boolean;
}

/**
 * Controls which instances of a recurring event series are affected by an
 * update or delete operation.
 *
 * - `'this'`              — only the specific instance identified by the event ID
 * - `'this_and_following'` — the identified instance and all future instances in the series
 *                            (requires an instance event ID with the `_YYYYMMDDTHHMMSSZ` suffix)
 * - `'all'`               — every instance in the series (targets the master event)
 */
export type RecurrenceScope = 'this' | 'this_and_following' | 'all';
