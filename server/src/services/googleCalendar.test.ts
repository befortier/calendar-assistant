import { describe, it, expect, vi } from 'vitest';
import { GoogleCalendarService, invertBusy } from './googleCalendar';
import type { calendar_v3 } from 'googleapis';

function makeCalendar(
  items: calendar_v3.Schema$Event[],
  overrides?: { freebusyQuery?: ReturnType<typeof vi.fn> },
): calendar_v3.Calendar {
  return {
    events: {
      list: vi.fn().mockResolvedValue({ data: { items } }),
      insert: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
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

  it('populates attendees as email strings when event has attendees', async () => {
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

    expect(events[0].attendees).toEqual(['alice@x.com', 'bob@x.com']);
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
  it('returns busy blocks keyed by email', async () => {
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
      'a@x.com': { busy: [{ start: '2026-03-22T09:00:00Z', end: '2026-03-22T10:00:00Z' }] },
      'b@x.com': { busy: [{ start: '2026-03-22T14:00:00Z', end: '2026-03-22T15:00:00Z' }] },
    });
  });

  it('returns empty busy array for an email with no busy blocks', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: { calendars: { 'a@x.com': { busy: [] } } },
    });
    const service = new GoogleCalendarService(makeCalendar([], { freebusyQuery: mockQuery }));

    const result = await service.getFreeBusy(['a@x.com'], START, END);

    expect(result).toEqual({ 'a@x.com': { busy: [] } });
  });

  it('returns empty busy array when busy key is missing from response entry', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: { calendars: { 'a@x.com': {} } },
    });
    const service = new GoogleCalendarService(makeCalendar([], { freebusyQuery: mockQuery }));

    const result = await service.getFreeBusy(['a@x.com'], START, END);

    expect(result).toEqual({ 'a@x.com': { busy: [] } });
  });

  it('returns empty busy array for an email absent from the response', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: { calendars: { 'a@x.com': { busy: [] } } },
    });
    const service = new GoogleCalendarService(makeCalendar([], { freebusyQuery: mockQuery }));

    const result = await service.getFreeBusy(['a@x.com', 'missing@x.com'], START, END);

    expect(result).toEqual({
      'a@x.com': { busy: [] },
      'missing@x.com': { busy: [] },
    });
  });

  it('returns errors array when Google reports notFound for a calendar', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: {
        calendars: {
          'accessible@x.com': {
            busy: [{ start: '2026-03-22T09:00:00Z', end: '2026-03-22T10:00:00Z' }],
          },
          'private@x.com': {
            errors: [{ domain: 'global', reason: 'notFound' }],
            busy: [],
          },
        },
      },
    });
    const service = new GoogleCalendarService(makeCalendar([], { freebusyQuery: mockQuery }));

    const result = await service.getFreeBusy(['accessible@x.com', 'private@x.com'], START, END);

    expect(result).toEqual({
      'accessible@x.com': { busy: [{ start: '2026-03-22T09:00:00Z', end: '2026-03-22T10:00:00Z' }] },
      'private@x.com': {
        busy: [],
        errors: [{ domain: 'global', reason: 'notFound' }],
      },
    });
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
    const service = new GoogleCalendarService(
      { events: { list: vi.fn(), insert: mockInsert, patch: vi.fn(), delete: vi.fn() }, freebusy: { query: vi.fn() } } as unknown as calendar_v3.Calendar,
    );

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
    const service = new GoogleCalendarService(
      { events: { list: vi.fn(), insert: mockInsert, patch: vi.fn(), delete: vi.fn() }, freebusy: { query: vi.fn() } } as unknown as calendar_v3.Calendar,
    );

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
    const service = new GoogleCalendarService(
      { events: { list: vi.fn(), insert: mockInsert, patch: vi.fn(), delete: vi.fn() }, freebusy: { query: vi.fn() } } as unknown as calendar_v3.Calendar,
    );

    await service.createEvent({ title: 'Team sync', start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z' });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ attendees: undefined }),
      }),
    );
  });

  it('throws when Google returns an event with missing start/end', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: { id: 'x', summary: 'Bad' } });
    const service = new GoogleCalendarService(
      { events: { list: vi.fn(), insert: mockInsert, patch: vi.fn(), delete: vi.fn() }, freebusy: { query: vi.fn() } } as unknown as calendar_v3.Calendar,
    );

    await expect(
      service.createEvent({ title: 'Bad', start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z' }),
    ).rejects.toThrow('createEvent');
  });
});

// ---------------------------------------------------------------------------
// updateEvent
// ---------------------------------------------------------------------------

describe('GoogleCalendarService.updateEvent', () => {
  it('returns a normalized CalendarEvent on success', async () => {
    const mockPatch = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(
      { events: { list: vi.fn(), insert: vi.fn(), patch: mockPatch, delete: vi.fn() }, freebusy: { query: vi.fn() } } as unknown as calendar_v3.Calendar,
    );

    const event = await service.updateEvent('new-evt', { title: 'Updated' });

    expect(event.id).toBe('new-evt');
  });

  it('only sends fields present in updates (partial patch)', async () => {
    const mockPatch = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(
      { events: { list: vi.fn(), insert: vi.fn(), patch: mockPatch, delete: vi.fn() }, freebusy: { query: vi.fn() } } as unknown as calendar_v3.Calendar,
    );

    await service.updateEvent('new-evt', { title: 'New title' });

    const call = mockPatch.mock.calls[0][0];
    expect(call.requestBody.summary).toBe('New title');
    expect(call.requestBody.start).toBeUndefined();
    expect(call.requestBody.end).toBeUndefined();
    expect(call.requestBody.attendees).toBeUndefined();
  });

  it('calls patch with correct calendarId and eventId', async () => {
    const mockPatch = vi.fn().mockResolvedValue({ data: MOCK_EVENT_RESPONSE });
    const service = new GoogleCalendarService(
      { events: { list: vi.fn(), insert: vi.fn(), patch: mockPatch, delete: vi.fn() }, freebusy: { query: vi.fn() } } as unknown as calendar_v3.Calendar,
    );

    await service.updateEvent('evt-123', { title: 'x' });

    expect(mockPatch).toHaveBeenCalledWith(expect.objectContaining({ calendarId: 'primary', eventId: 'evt-123' }));
  });

  it('throws when Google returns an event with missing start/end', async () => {
    const mockPatch = vi.fn().mockResolvedValue({ data: { id: 'x', summary: 'Bad' } });
    const service = new GoogleCalendarService(
      { events: { list: vi.fn(), insert: vi.fn(), patch: mockPatch, delete: vi.fn() }, freebusy: { query: vi.fn() } } as unknown as calendar_v3.Calendar,
    );

    await expect(service.updateEvent('x', { title: 'Bad' })).rejects.toThrow('updateEvent');
  });
});

// ---------------------------------------------------------------------------
// deleteEvent
// ---------------------------------------------------------------------------

describe('GoogleCalendarService.deleteEvent', () => {
  it('calls events.delete with correct calendarId and eventId', async () => {
    const mockDelete = vi.fn().mockResolvedValue({});
    const service = new GoogleCalendarService(
      { events: { list: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: mockDelete }, freebusy: { query: vi.fn() } } as unknown as calendar_v3.Calendar,
    );

    await service.deleteEvent('evt-abc');

    expect(mockDelete).toHaveBeenCalledWith({ calendarId: 'primary', eventId: 'evt-abc' });
  });

  it('resolves with undefined', async () => {
    const service = new GoogleCalendarService(
      { events: { list: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: vi.fn().mockResolvedValue({}) }, freebusy: { query: vi.fn() } } as unknown as calendar_v3.Calendar,
    );

    const result = await service.deleteEvent('evt-abc');

    expect(result).toBeUndefined();
  });
});
