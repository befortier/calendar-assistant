import { describe, it, expect, vi } from 'vitest';
import { GoogleCalendarService, invertBusy } from './googleCalendar';
import type { calendar_v3 } from 'googleapis';

function makeCalendar(
  items: calendar_v3.Schema$Event[],
  overrides?: {
    freebusyQuery?: ReturnType<typeof vi.fn>;
    insert?: ReturnType<typeof vi.fn>;
    patch?: ReturnType<typeof vi.fn>;
    delete?: ReturnType<typeof vi.fn>;
  },
): calendar_v3.Calendar {
  return {
    events: {
      list: vi.fn().mockResolvedValue({ data: { items } }),
      insert: overrides?.insert ?? vi.fn(),
      patch: overrides?.patch ?? vi.fn(),
      delete: overrides?.delete ?? vi.fn(),
    },
    freebusy: {
      query: overrides?.freebusyQuery ?? vi.fn(),
    },
  } as unknown as calendar_v3.Calendar;
}

const START = new Date('2026-03-22T00:00:00Z');
const END = new Date('2026-03-22T23:59:59Z');

describe('GoogleCalendarService.getEvents', () => {
  it('normalizes a timed event to CalendarEvent shape', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        {
          id: 'abc123',
          summary: 'Team standup',
          start: { dateTime: '2026-03-22T09:00:00Z' },
          end: { dateTime: '2026-03-22T09:30:00Z' },
          location: 'Zoom',
          description: 'Daily sync',
        },
      ]),
    );

    const events = await service.getEvents(START, END);

    expect(events).toEqual([
      {
        id: 'abc123',
        title: 'Team standup',
        start: '2026-03-22T09:00:00Z',
        end: '2026-03-22T09:30:00Z',
        allDay: false,
        location: 'Zoom',
        description: 'Daily sync',
        attendees: undefined,
      },
    ]);
  });

  it('normalizes an all-day event (date, not dateTime)', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        {
          id: 'day1',
          summary: 'Company holiday',
          start: { date: '2026-03-22' },
          end: { date: '2026-03-23' },
        },
      ]),
    );

    const events = await service.getEvents(START, END);

    expect(events).toEqual([
      {
        id: 'day1',
        title: 'Company holiday',
        start: '2026-03-22',
        end: '2026-03-23',
        allDay: true,
        location: undefined,
        description: undefined,
        attendees: undefined,
      },
    ]);
  });

  it('skips events that have no start or end date fields', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        { id: 'bad', summary: 'Broken event', start: {}, end: {} },
        {
          id: 'good',
          summary: 'Valid event',
          start: { dateTime: '2026-03-22T09:00:00Z' },
          end: { dateTime: '2026-03-22T10:00:00Z' },
        },
      ]),
    );

    const events = await service.getEvents(START, END);

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('good');
  });

  it('returns empty array when items is undefined', async () => {
    const calendar = {
      events: { list: vi.fn().mockResolvedValue({ data: {} }) },
    } as unknown as calendar_v3.Calendar;
    const service = new GoogleCalendarService(calendar);

    const events = await service.getEvents(START, END);

    expect(events).toEqual([]);
  });

  it('populates attendees as objects with email and responseStatus when event has attendees', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        {
          id: 'e1',
          summary: 'Team sync',
          start: { dateTime: '2026-03-22T09:00:00Z' },
          end:   { dateTime: '2026-03-22T10:00:00Z' },
          attendees: [
            { email: 'alice@x.com', responseStatus: 'accepted' },
            { email: 'bob@x.com',   responseStatus: 'needsAction' },
          ],
        },
      ]),
    );

    const events = await service.getEvents(START, END);

    expect(events[0].attendees).toEqual([
      { email: 'alice@x.com', responseStatus: 'accepted' },
      { email: 'bob@x.com', responseStatus: 'needsAction' },
    ]);
  });

  it('sets attendees to undefined when event has no attendees', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        {
          id: 'e1',
          summary: 'Solo block',
          start: { dateTime: '2026-03-22T09:00:00Z' },
          end:   { dateTime: '2026-03-22T10:00:00Z' },
        },
      ]),
    );

    const events = await service.getEvents(START, END);

    expect(events[0].attendees).toBeUndefined();
  });

  it('calls list with correct timeMin, timeMax, and calendarId', async () => {
    const mockList = vi.fn().mockResolvedValue({ data: { items: [] } });
    const service = new GoogleCalendarService({
      events: { list: mockList },
    } as unknown as calendar_v3.Calendar);

    await service.getEvents(START, END);

    expect(mockList).toHaveBeenCalledWith({
      calendarId: 'primary',
      timeMin: START.toISOString(),
      timeMax: END.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
  });
});

// ---------------------------------------------------------------------------
// invertBusy — pure utility: busy blocks + range → free windows
// ---------------------------------------------------------------------------

describe('invertBusy', () => {
  it('returns the full range as one free slot when there are no busy blocks', () => {
    const slots = invertBusy([], START, END);
    expect(slots).toEqual([{ start: START.toISOString(), end: END.toISOString() }]);
  });

  it('returns gap between two busy blocks', () => {
    const slots = invertBusy(
      [
        { start: '2026-03-22T09:00:00Z', end: '2026-03-22T10:00:00Z' },
        { start: '2026-03-22T14:00:00Z', end: '2026-03-22T15:00:00Z' },
      ],
      START,
      END,
    );

    expect(slots).toEqual([
      { start: START.toISOString(),        end: '2026-03-22T09:00:00.000Z' },
      { start: '2026-03-22T10:00:00.000Z', end: '2026-03-22T14:00:00.000Z' },
      { start: '2026-03-22T15:00:00.000Z', end: END.toISOString() },
    ]);
  });

  it('merges overlapping busy blocks before computing free windows', () => {
    const slots = invertBusy(
      [
        { start: '2026-03-22T09:00:00Z', end: '2026-03-22T11:00:00Z' },
        { start: '2026-03-22T10:00:00Z', end: '2026-03-22T12:00:00Z' },
      ],
      START,
      END,
    );

    expect(slots).toEqual([
      { start: START.toISOString(),        end: '2026-03-22T09:00:00.000Z' },
      { start: '2026-03-22T12:00:00.000Z', end: END.toISOString() },
    ]);
  });

  it('returns empty array when a single block spans the full range', () => {
    const slots = invertBusy(
      [{ start: START.toISOString(), end: END.toISOString() }],
      START,
      END,
    );
    expect(slots).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getFreeBusy
// ---------------------------------------------------------------------------

describe('GoogleCalendarService.getFreeBusy', () => {
  it('returns accessible:true and status:ok for a reachable calendar with busy blocks', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: {
        calendars: {
          'a@x.com': { busy: [{ start: '2026-03-22T09:00:00Z', end: '2026-03-22T10:00:00Z' }] },
          'b@x.com': { busy: [{ start: '2026-03-22T14:00:00Z', end: '2026-03-22T15:00:00Z' }] },
        },
      },
    });
    const service = new GoogleCalendarService(makeCalendar([], { freebusyQuery: mockQuery }));

    const result = await service.getFreeBusy(['a@x.com', 'b@x.com'], START, END);

    expect(result).toEqual({
      'a@x.com': { accessible: true, status: 'ok', busy: [{ start: '2026-03-22T09:00:00Z', end: '2026-03-22T10:00:00Z' }] },
      'b@x.com': { accessible: true, status: 'ok', busy: [{ start: '2026-03-22T14:00:00Z', end: '2026-03-22T15:00:00Z' }] },
    });
  });

  it('returns accessible:true and status:ok for a reachable calendar with no busy blocks', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: { calendars: { 'a@x.com': { busy: [] } } },
    });
    const service = new GoogleCalendarService(makeCalendar([], { freebusyQuery: mockQuery }));

    const result = await service.getFreeBusy(['a@x.com'], START, END);

    expect(result).toEqual({ 'a@x.com': { accessible: true, status: 'ok', busy: [] } });
  });

  it('returns accessible:true and status:ok when busy key is missing from response entry', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: { calendars: { 'a@x.com': {} } },
    });
    const service = new GoogleCalendarService(makeCalendar([], { freebusyQuery: mockQuery }));

    const result = await service.getFreeBusy(['a@x.com'], START, END);

    expect(result).toEqual({ 'a@x.com': { accessible: true, status: 'ok', busy: [] } });
  });

  it('returns accessible:true and status:ok for an email absent from the response', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: { calendars: { 'a@x.com': { busy: [] } } },
    });
    const service = new GoogleCalendarService(makeCalendar([], { freebusyQuery: mockQuery }));

    const result = await service.getFreeBusy(['a@x.com', 'missing@x.com'], START, END);

    expect(result).toEqual({
      'a@x.com': { accessible: true, status: 'ok', busy: [] },
      'missing@x.com': { accessible: true, status: 'ok', busy: [] },
    });
  });

  it('returns accessible:false and status:not_found when Google reports notFound', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: {
        calendars: {
          'accessible@x.com': { busy: [{ start: '2026-03-22T09:00:00Z', end: '2026-03-22T10:00:00Z' }] },
          'private@x.com': { errors: [{ domain: 'global', reason: 'notFound' }], busy: [] },
        },
      },
    });
    const service = new GoogleCalendarService(makeCalendar([], { freebusyQuery: mockQuery }));

    const result = await service.getFreeBusy(['accessible@x.com', 'private@x.com'], START, END);

    expect(result['accessible@x.com']).toEqual({
      accessible: true,
      status: 'ok',
      busy: [{ start: '2026-03-22T09:00:00Z', end: '2026-03-22T10:00:00Z' }],
    });
    expect(result['private@x.com']).toEqual({
      accessible: false,
      status: 'not_found',
      busy: [],
      errors: [{ domain: 'global', reason: 'notFound' }],
    });
  });

  it('returns accessible:false and status:forbidden when Google reports authError', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: {
        calendars: {
          'forbidden@x.com': { errors: [{ domain: 'global', reason: 'authError' }], busy: [] },
        },
      },
    });
    const service = new GoogleCalendarService(makeCalendar([], { freebusyQuery: mockQuery }));

    const result = await service.getFreeBusy(['forbidden@x.com'], START, END);

    expect(result['forbidden@x.com']).toMatchObject({ accessible: false, status: 'forbidden' });
  });

  it('returns accessible:false and status:unknown for unrecognised error reasons', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: {
        calendars: {
          'weird@x.com': { errors: [{ domain: 'global', reason: 'somethingElse' }], busy: [] },
        },
      },
    });
    const service = new GoogleCalendarService(makeCalendar([], { freebusyQuery: mockQuery }));

    const result = await service.getFreeBusy(['weird@x.com'], START, END);

    expect(result['weird@x.com']).toMatchObject({ accessible: false, status: 'unknown' });
  });

  it('calls freebusy.query with correct timeMin, timeMax, and items', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ data: { calendars: {} } });
    const service = new GoogleCalendarService(makeCalendar([], { freebusyQuery: mockQuery }));

    await service.getFreeBusy(['a@x.com', 'b@x.com'], START, END);

    expect(mockQuery).toHaveBeenCalledWith({
      requestBody: {
        timeMin: START.toISOString(),
        timeMax: END.toISOString(),
        items: [{ id: 'a@x.com' }, { id: 'b@x.com' }],
      },
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeEvent — recurrence, reminders, meetLink (via getEvents)
// ---------------------------------------------------------------------------

describe('GoogleCalendarService.getEvents — normalizeEvent extras', () => {
  it('extracts recurrence array from Google event', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        {
          id: 'rec1',
          summary: 'Weekly standup',
          start: { dateTime: '2026-03-22T09:00:00Z' },
          end: { dateTime: '2026-03-22T09:30:00Z' },
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
        },
      ]),
    );

    const events = await service.getEvents(START, END);

    expect(events[0].recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO']);
  });

  it('sets recurrence to undefined when event has no recurrence', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        {
          id: 'norec',
          summary: 'One-off',
          start: { dateTime: '2026-03-22T09:00:00Z' },
          end: { dateTime: '2026-03-22T09:30:00Z' },
        },
      ]),
    );

    const events = await service.getEvents(START, END);

    expect(events[0].recurrence).toBeUndefined();
  });

  it('extracts reminder overrides when useDefault is false', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        {
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
        },
      ]),
    );

    const events = await service.getEvents(START, END);

    expect(events[0].reminders).toEqual([
      { method: 'email', minutes: 30 },
      { method: 'popup', minutes: 10 },
    ]);
  });

  it('sets reminders to undefined when useDefault is true', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        {
          id: 'remdef',
          summary: 'Default reminders',
          start: { dateTime: '2026-03-22T09:00:00Z' },
          end: { dateTime: '2026-03-22T09:30:00Z' },
          reminders: { useDefault: true },
        },
      ]),
    );

    const events = await service.getEvents(START, END);

    expect(events[0].reminders).toBeUndefined();
  });

  it('extracts meetLink from conferenceData video entryPoint', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        {
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
        },
      ]),
    );

    const events = await service.getEvents(START, END);

    expect(events[0].meetLink).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('sets meetLink to undefined when no video entryPoint exists', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        {
          id: 'nomeet',
          summary: 'No video',
          start: { dateTime: '2026-03-22T09:00:00Z' },
          end: { dateTime: '2026-03-22T09:30:00Z' },
        },
      ]),
    );

    const events = await service.getEvents(START, END);

    expect(events[0].meetLink).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createEvent
// ---------------------------------------------------------------------------

const MOCK_EVENT_RESPONSE: calendar_v3.Schema$Event = {
  id: 'new-evt',
  summary: 'Team sync',
  start: { dateTime: '2026-03-22T10:00:00Z' },
  end:   { dateTime: '2026-03-22T10:30:00Z' },
};

describe('GoogleCalendarService.createEvent', () => {
  it('returns a normalized CalendarEvent on success', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar([], { insert: mockInsert }));

    const event = await service.createEvent({
      title: 'Team sync',
      start: '2026-03-22T10:00:00Z',
      end:   '2026-03-22T10:30:00Z',
    });

    expect(event).toEqual({
      id: 'new-evt',
      title: 'Team sync',
      start: '2026-03-22T10:00:00Z',
      end:   '2026-03-22T10:30:00Z',
      allDay: false,
      attendees: undefined,
      location: undefined,
      description: undefined,
    });
  });

  it('includes attendees in requestBody when provided', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar([], { insert: mockInsert }));

    await service.createEvent({
      title: 'Team sync',
      start: '2026-03-22T10:00:00Z',
      end:   '2026-03-22T10:30:00Z',
      attendees: ['a@x.com', 'b@x.com'],
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          attendees: [{ email: 'a@x.com' }, { email: 'b@x.com' }],
        }),
      }),
    );
  });

  it('omits attendees from requestBody when not provided', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar([], { insert: mockInsert }));

    await service.createEvent({ title: 'Team sync', start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z' });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ attendees: undefined }),
      }),
    );
  });

  it('throws when Google returns an event with missing start/end', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: { id: 'x', summary: 'Bad' } });
    const service = new GoogleCalendarService(makeCalendar([], { insert: mockInsert }));

    await expect(
      service.createEvent({ title: 'Bad', start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z' }),
    ).rejects.toThrow('createEvent');
  });

  it('passes recurrence array to requestBody', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar([], { insert: mockInsert }));

    await service.createEvent({
      title: 'Weekly sync',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
        }),
      }),
    );
  });

  it('translates reminders to { useDefault: false, overrides } in requestBody', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar([], { insert: mockInsert }));

    await service.createEvent({
      title: 'Team sync',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
      reminders: [{ method: 'popup', minutes: 15 }],
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] },
        }),
      }),
    );
  });

  it('omits reminders from requestBody when not provided', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar([], { insert: mockInsert }));

    await service.createEvent({ title: 'Team sync', start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z' });

    const call = mockInsert.mock.calls[0][0];
    expect(call.requestBody.reminders).toBeUndefined();
  });

  it('adds conferenceData when attendees are present', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar([], { insert: mockInsert }));

    await service.createEvent({
      title: 'Team sync',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
      attendees: ['a@x.com'],
    });

    const call = mockInsert.mock.calls[0][0];
    expect(call.requestBody.conferenceData).toBeDefined();
    expect(call.requestBody.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');
    expect(call.conferenceDataVersion).toBe(1);
  });

  it('does NOT add conferenceData when no attendees provided', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar([], { insert: mockInsert }));

    await service.createEvent({ title: 'Solo block', start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z' });

    const call = mockInsert.mock.calls[0][0];
    expect(call.requestBody.conferenceData).toBeUndefined();
    expect(call.conferenceDataVersion).toBeUndefined();
  });

  it('uses { date } start/end when allDay is true', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar([], { insert: mockInsert }));

    await service.createEvent({
      title: 'Company holiday',
      start: '2026-03-22',
      end: '2026-03-23',
      allDay: true,
    });

    const call = mockInsert.mock.calls[0][0];
    expect(call.requestBody.start).toEqual({ date: '2026-03-22' });
    expect(call.requestBody.end).toEqual({ date: '2026-03-23' });
  });

  it('uses { dateTime } start/end when allDay is false', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar([], { insert: mockInsert }));

    await service.createEvent({
      title: 'Team sync',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
      allDay: false,
    });

    const call = mockInsert.mock.calls[0][0];
    expect(call.requestBody.start).toEqual({ dateTime: '2026-03-22T10:00:00Z' });
    expect(call.requestBody.end).toEqual({ dateTime: '2026-03-22T10:30:00Z' });
  });

  it('uses { dateTime } start/end when allDay is undefined', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar([], { insert: mockInsert }));

    await service.createEvent({
      title: 'Team sync',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
    });

    const call = mockInsert.mock.calls[0][0];
    expect(call.requestBody.start).toEqual({ dateTime: '2026-03-22T10:00:00Z' });
    expect(call.requestBody.end).toEqual({ dateTime: '2026-03-22T10:30:00Z' });
  });
});

// ---------------------------------------------------------------------------
// updateEvent
// ---------------------------------------------------------------------------

describe('GoogleCalendarService.updateEvent', () => {
  it('returns a normalized CalendarEvent on success', async () => {
    const mockPatch = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar([], { patch: mockPatch }));

    const event = await service.updateEvent('new-evt', { title: 'Updated' });

    expect(event.id).toBe('new-evt');
  });

  it('only sends fields present in updates (partial patch)', async () => {
    const mockPatch = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar([], { patch: mockPatch }));

    await service.updateEvent('new-evt', { title: 'New title' });

    const call = mockPatch.mock.calls[0][0];
    expect(call.requestBody.summary).toBe('New title');
    expect(call.requestBody.start).toBeUndefined();
    expect(call.requestBody.end).toBeUndefined();
    expect(call.requestBody.attendees).toBeUndefined();
  });

  it('calls patch with correct calendarId and eventId', async () => {
    const mockPatch = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar([], { patch: mockPatch }));

    await service.updateEvent('evt-123', { title: 'x' });

    expect(mockPatch).toHaveBeenCalledWith(expect.objectContaining({ calendarId: 'primary', eventId: 'evt-123' }));
  });

  it('throws when Google returns an event with missing start/end', async () => {
    const mockPatch = vi.fn().mockResolvedValue({ data: { id: 'x', summary: 'Bad' } });
    const service = new GoogleCalendarService(makeCalendar([], { patch: mockPatch }));

    await expect(service.updateEvent('x', { title: 'Bad' })).rejects.toThrow('updateEvent');
  });
});

// ---------------------------------------------------------------------------
// deleteEvent
// ---------------------------------------------------------------------------

describe('GoogleCalendarService.deleteEvent', () => {
  it('calls events.delete with correct calendarId and eventId', async () => {
    const mockDelete = vi.fn().mockResolvedValue({});
    const service = new GoogleCalendarService(makeCalendar([], { delete: mockDelete }));

    await service.deleteEvent('evt-abc');

    expect(mockDelete).toHaveBeenCalledWith({ calendarId: 'primary', eventId: 'evt-abc' });
  });

  it('resolves with undefined', async () => {
    const service = new GoogleCalendarService(makeCalendar([], { delete: vi.fn().mockResolvedValue({}) }));

    const result = await service.deleteEvent('evt-abc');

    expect(result).toBeUndefined();
  });
});
