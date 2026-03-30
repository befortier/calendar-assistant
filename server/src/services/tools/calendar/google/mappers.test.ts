import { describe, it, expect } from 'vitest';
import type { calendar_v3 } from 'googleapis';
import { normalizeEvent, resolveAccessStatus } from './mappers';

// ---------------------------------------------------------------------------
// resolveAccessStatus
// ---------------------------------------------------------------------------

describe('resolveAccessStatus', () => {
  it("maps 'notFound' to 'not_found'", () => {
    expect(resolveAccessStatus('notFound')).toBe('not_found');
  });

  it("maps 'authError' to 'forbidden'", () => {
    expect(resolveAccessStatus('authError')).toBe('forbidden');
  });

  it("maps unrecognised reasons to 'unknown'", () => {
    expect(resolveAccessStatus('somethingElse')).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// normalizeEvent
// ---------------------------------------------------------------------------

describe('normalizeEvent', () => {
  it('normalizes a timed event to CalendarEvent shape', () => {
    const event: calendar_v3.Schema$Event = {
      id: 'abc123',
      summary: 'Team standup',
      start: { dateTime: '2026-03-22T09:00:00Z' },
      end: { dateTime: '2026-03-22T09:30:00Z' },
      location: 'Zoom',
      description: 'Daily sync',
    };

    expect(normalizeEvent(event)).toEqual({
      id: 'abc123',
      title: 'Team standup',
      start: '2026-03-22T09:00:00Z',
      end: '2026-03-22T09:30:00Z',
      allDay: false,
      location: 'Zoom',
      description: 'Daily sync',
      attendees: undefined,
    });
  });

  it('normalizes an all-day event (date, not dateTime)', () => {
    const event: calendar_v3.Schema$Event = {
      id: 'day1',
      summary: 'Company holiday',
      start: { date: '2026-03-22' },
      end: { date: '2026-03-23' },
    };

    expect(normalizeEvent(event)).toEqual({
      id: 'day1',
      title: 'Company holiday',
      start: '2026-03-22',
      end: '2026-03-23',
      allDay: true,
      location: undefined,
      description: undefined,
      attendees: undefined,
    });
  });

  it('returns null when start and end date fields are empty', () => {
    expect(normalizeEvent({ id: 'bad', summary: 'Broken event', start: {}, end: {} })).toBeNull();
  });

  it('populates attendees with email and responseStatus', () => {
    const event: calendar_v3.Schema$Event = {
      id: 'e1',
      summary: 'Team sync',
      start: { dateTime: '2026-03-22T09:00:00Z' },
      end: { dateTime: '2026-03-22T10:00:00Z' },
      attendees: [
        { email: 'alice@x.com', responseStatus: 'accepted' },
        { email: 'bob@x.com', responseStatus: 'needsAction' },
      ],
    };

    expect(normalizeEvent(event)?.attendees).toEqual([
      { email: 'alice@x.com', responseStatus: 'accepted' },
      { email: 'bob@x.com', responseStatus: 'needsAction' },
    ]);
  });

  it('sets attendees to undefined when event has no attendees', () => {
    const event: calendar_v3.Schema$Event = {
      id: 'e1',
      summary: 'Solo block',
      start: { dateTime: '2026-03-22T09:00:00Z' },
      end: { dateTime: '2026-03-22T10:00:00Z' },
    };

    expect(normalizeEvent(event)?.attendees).toBeUndefined();
  });

  it('extracts recurrence array', () => {
    const event: calendar_v3.Schema$Event = {
      id: 'rec1',
      summary: 'Weekly standup',
      start: { dateTime: '2026-03-22T09:00:00Z' },
      end: { dateTime: '2026-03-22T09:30:00Z' },
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
    };

    expect(normalizeEvent(event)?.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO']);
  });

  it('sets recurrence to undefined when event has no recurrence', () => {
    const event: calendar_v3.Schema$Event = {
      id: 'norec',
      summary: 'One-off',
      start: { dateTime: '2026-03-22T09:00:00Z' },
      end: { dateTime: '2026-03-22T09:30:00Z' },
    };

    expect(normalizeEvent(event)?.recurrence).toBeUndefined();
  });

  it('extracts reminder overrides when useDefault is false', () => {
    const event: calendar_v3.Schema$Event = {
      id: 'rem1',
      summary: 'Reminder event',
      start: { dateTime: '2026-03-22T09:00:00Z' },
      end: { dateTime: '2026-03-22T09:30:00Z' },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 30 },
          { method: 'popup', minutes: 10 },
        ],
      },
    };

    expect(normalizeEvent(event)?.reminders).toEqual([
      { method: 'email', minutes: 30 },
      { method: 'popup', minutes: 10 },
    ]);
  });

  it('sets reminders to undefined when useDefault is true', () => {
    const event: calendar_v3.Schema$Event = {
      id: 'remdef',
      summary: 'Default reminders',
      start: { dateTime: '2026-03-22T09:00:00Z' },
      end: { dateTime: '2026-03-22T09:30:00Z' },
      reminders: { useDefault: true },
    };

    expect(normalizeEvent(event)?.reminders).toBeUndefined();
  });

  it('extracts meetLink from conferenceData video entryPoint', () => {
    const event: calendar_v3.Schema$Event = {
      id: 'meet1',
      summary: 'Video call',
      start: { dateTime: '2026-03-22T09:00:00Z' },
      end: { dateTime: '2026-03-22T09:30:00Z' },
      conferenceData: {
        entryPoints: [
          { entryPointType: 'phone', uri: 'tel:+1234567890' },
          { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
        ],
      },
    };

    expect(normalizeEvent(event)?.meetLink).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('sets meetLink to undefined when no video entryPoint exists', () => {
    const event: calendar_v3.Schema$Event = {
      id: 'nomeet',
      summary: 'No video',
      start: { dateTime: '2026-03-22T09:00:00Z' },
      end: { dateTime: '2026-03-22T09:30:00Z' },
    };

    expect(normalizeEvent(event)?.meetLink).toBeUndefined();
  });
});
