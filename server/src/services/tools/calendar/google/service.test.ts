import { describe, it, expect, vi } from 'vitest';
import { GoogleCalendarService } from './service';
import type { GoogleCalendarDeps } from './service';
import type { calendar_v3 } from 'googleapis';
import type { CalendarEvent } from './types';
import { normalizeEvent } from './mappers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NORMALIZED_EVENT: CalendarEvent = {
  id: 'evt-1', title: 'Stub', start: '2026-03-22T09:00:00Z',
  end: '2026-03-22T09:30:00Z', allDay: false,
};

function makeDeps(overrides?: Partial<GoogleCalendarDeps>): GoogleCalendarDeps {
  return {
    normalizeEvent: vi.fn().mockReturnValue(NORMALIZED_EVENT),
    resolveAccessStatus: vi.fn().mockReturnValue('not_found'),
    stripRecurrenceSuffix: vi.fn((id: string) => id.replace(/_\d{8}(T\d{6}Z)?$/, '')),
    truncateRruleUntil: vi.fn((_rrule: string, _id: string) => 'RRULE:FREQ=WEEKLY;UNTIL=STUBBED'),
    retry: <T>(fn: () => Promise<T>): Promise<T> => fn(),
    ...overrides,
  };
}

function makeCalendar(overrides?: {
  list?: ReturnType<typeof vi.fn>;
  freebusyQuery?: ReturnType<typeof vi.fn>;
  insert?: ReturnType<typeof vi.fn>;
  patch?: ReturnType<typeof vi.fn>;
  delete?: ReturnType<typeof vi.fn>;
  get?: ReturnType<typeof vi.fn>;
  calendarListList?: ReturnType<typeof vi.fn>;
}): calendar_v3.Calendar {
  return {
    events: {
      list: overrides?.list ?? vi.fn().mockResolvedValue({ data: { items: [] } }),
      insert: overrides?.insert ?? vi.fn(),
      patch: overrides?.patch ?? vi.fn(),
      delete: overrides?.delete ?? vi.fn(),
      get: overrides?.get ?? vi.fn(),
    },
    freebusy: {
      query: overrides?.freebusyQuery ?? vi.fn(),
    },
    calendarList: {
      list: overrides?.calendarListList ?? vi.fn().mockResolvedValue({ data: { items: [] } }),
    },
  } as unknown as calendar_v3.Calendar;
}

const START = new Date('2026-03-22T00:00:00Z');
const END = new Date('2026-03-22T23:59:59Z');

// ---------------------------------------------------------------------------
// listCalendars
// ---------------------------------------------------------------------------

describe('GoogleCalendarService.listCalendars', () => {
  it('returns normalized calendar entries', async () => {
    const mockList = vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: 'primary', summary: 'My Calendar', backgroundColor: '#4285f4', primary: true },
          { id: 'work@example.com', summary: 'Work', summaryOverride: 'Work Override', backgroundColor: '#db4437', primary: false },
          { id: 'other@example.com', summary: 'Other', primary: false },
        ],
      },
    });
    const service = new GoogleCalendarService(makeCalendar({ calendarListList: mockList }), 'primary', makeDeps());

    const result = await service.listCalendars();

    expect(result).toEqual([
      { id: 'primary', summary: 'My Calendar', backgroundColor: '#4285f4', primary: true },
      { id: 'work@example.com', summary: 'Work Override', backgroundColor: '#db4437', primary: false },
      { id: 'other@example.com', summary: 'Other', backgroundColor: undefined, primary: false },
    ]);
    expect(mockList).toHaveBeenCalledWith({ minAccessRole: 'reader' });
  });

  it('filters out entries with no id', async () => {
    const mockList = vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: 'primary', summary: 'Mine', primary: true },
          { id: '', summary: 'Bad', primary: false },
          { summary: 'Also bad', primary: false },
        ],
      },
    });
    const service = new GoogleCalendarService(makeCalendar({ calendarListList: mockList }), 'primary', makeDeps());

    const result = await service.listCalendars();

    expect(result).toHaveLength(1);
  });

  it('returns empty array when items is undefined', async () => {
    const mockList = vi.fn().mockResolvedValue({ data: {} });
    const service = new GoogleCalendarService(makeCalendar({ calendarListList: mockList }), 'primary', makeDeps());

    expect(await service.listCalendars()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getEvents
// ---------------------------------------------------------------------------

describe('GoogleCalendarService.getEvents', () => {
  it('calls list with correct params and pipes items through deps.normalizeEvent', async () => {
    const mockList = vi.fn().mockResolvedValue({ data: { items: [{ id: 'raw-1' }, { id: 'raw-2' }] } });
    const deps = makeDeps();
    const service = new GoogleCalendarService(makeCalendar({ list: mockList }), 'primary', deps);

    const events = await service.getEvents(START, END);

    expect(mockList).toHaveBeenCalledWith({
      calendarId: 'primary', timeMin: START.toISOString(), timeMax: END.toISOString(),
      singleEvents: true, orderBy: 'startTime',
    });
    expect(deps.normalizeEvent).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(2);
  });

  it('filters out items where normalizeEvent returns null', async () => {
    const mockList = vi.fn().mockResolvedValue({ data: { items: [{ id: 'good' }, { id: 'bad' }] } });
    const deps = makeDeps({
      normalizeEvent: vi.fn().mockReturnValueOnce(NORMALIZED_EVENT).mockReturnValueOnce(null),
    });
    const service = new GoogleCalendarService(makeCalendar({ list: mockList }), 'primary', deps);

    expect(await service.getEvents(START, END)).toHaveLength(1);
  });

  it('returns empty array when items is undefined', async () => {
    const mockList = vi.fn().mockResolvedValue({ data: {} });
    const service = new GoogleCalendarService(makeCalendar({ list: mockList }), 'primary', makeDeps());

    expect(await service.getEvents(START, END)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getFreeBusy
// ---------------------------------------------------------------------------

describe('GoogleCalendarService.getFreeBusy', () => {
  it('returns accessible:true with busy blocks for a reachable calendar', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: { calendars: { 'a@x.com': { busy: [{ start: '2026-03-22T09:00:00Z', end: '2026-03-22T10:00:00Z' }] } } },
    });
    const service = new GoogleCalendarService(makeCalendar({ freebusyQuery: mockQuery }), 'primary', makeDeps());

    const result = await service.getFreeBusy(['a@x.com'], START, END);

    expect(result['a@x.com']).toEqual({
      accessible: true, status: 'ok',
      busy: [{ start: '2026-03-22T09:00:00Z', end: '2026-03-22T10:00:00Z' }],
    });
  });

  it('calls deps.resolveAccessStatus when errors are present', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: { calendars: { 'private@x.com': { errors: [{ domain: 'global', reason: 'notFound' }], busy: [] } } },
    });
    const deps = makeDeps();
    const service = new GoogleCalendarService(makeCalendar({ freebusyQuery: mockQuery }), 'primary', deps);

    const result = await service.getFreeBusy(['private@x.com'], START, END);

    expect(deps.resolveAccessStatus).toHaveBeenCalledWith('notFound');
    expect(result['private@x.com'].accessible).toBe(false);
  });

  it('calls freebusy.query with correct params', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ data: { calendars: {} } });
    const service = new GoogleCalendarService(makeCalendar({ freebusyQuery: mockQuery }), 'primary', makeDeps());

    await service.getFreeBusy(['a@x.com', 'b@x.com'], START, END);

    expect(mockQuery).toHaveBeenCalledWith({
      requestBody: { timeMin: START.toISOString(), timeMax: END.toISOString(), items: [{ id: 'a@x.com' }, { id: 'b@x.com' }] },
    });
  });
});

// ---------------------------------------------------------------------------
// createEvent
// ---------------------------------------------------------------------------

const MOCK_API_RESPONSE = { id: 'new-evt', summary: 'Team sync', start: { dateTime: '2026-03-22T10:00:00Z' }, end: { dateTime: '2026-03-22T10:30:00Z' } };

describe('GoogleCalendarService.createEvent', () => {
  it('calls insert and returns result of deps.normalizeEvent', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_API_RESPONSE });
    const deps = makeDeps();
    const service = new GoogleCalendarService(makeCalendar({ insert: mockInsert }), 'primary', deps);

    const event = await service.createEvent({ title: 'Team sync', start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z' });

    expect(mockInsert).toHaveBeenCalled();
    expect(deps.normalizeEvent).toHaveBeenCalledWith(MOCK_API_RESPONSE);
    expect(event).toEqual(NORMALIZED_EVENT);
  });

  it('includes attendees and conferenceData when attendees are provided', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_API_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar({ insert: mockInsert }), 'primary', makeDeps());

    await service.createEvent({
      title: 'Team sync', start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z',
      attendees: ['a@x.com', 'b@x.com'],
    });

    const call = mockInsert.mock.calls[0][0];
    expect(call.requestBody.attendees).toEqual([{ email: 'a@x.com' }, { email: 'b@x.com' }]);
    expect(call.requestBody.conferenceData).toBeDefined();
    expect(call.conferenceDataVersion).toBe(1);
  });

  it('does NOT add conferenceData when no attendees provided', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_API_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar({ insert: mockInsert }), 'primary', makeDeps());

    await service.createEvent({ title: 'Solo block', start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z' });

    const call = mockInsert.mock.calls[0][0];
    expect(call.requestBody.conferenceData).toBeUndefined();
  });

  it('throws when deps.normalizeEvent returns null', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: { id: 'x', summary: 'Bad' } });
    const deps = makeDeps({ normalizeEvent: vi.fn().mockReturnValue(null) });
    const service = new GoogleCalendarService(makeCalendar({ insert: mockInsert }), 'primary', deps);

    await expect(
      service.createEvent({ title: 'Bad', start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z' }),
    ).rejects.toThrow('createEvent');
  });

  it('uses { date } start/end when allDay is true', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_API_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar({ insert: mockInsert }), 'primary', makeDeps());

    await service.createEvent({ title: 'Holiday', start: '2026-03-22', end: '2026-03-23', allDay: true });

    const call = mockInsert.mock.calls[0][0];
    expect(call.requestBody.start).toEqual({ date: '2026-03-22' });
    expect(call.requestBody.end).toEqual({ date: '2026-03-23' });
  });

  it('passes recurrence and reminders to requestBody', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: MOCK_API_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar({ insert: mockInsert }), 'primary', makeDeps());

    await service.createEvent({
      title: 'Weekly', start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
      reminders: [{ method: 'popup', minutes: 15 }],
    });

    const call = mockInsert.mock.calls[0][0];
    expect(call.requestBody.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO']);
    expect(call.requestBody.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] });
  });

  it('retries through deps.retry on transient failures', async () => {
    const rateLimited = Object.assign(new Error('HTTP 429'), { code: '429', response: { status: 429 } });
    const mockInsert = vi.fn()
      .mockRejectedValueOnce(rateLimited)
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValueOnce({ data: MOCK_API_RESPONSE });
    // retry passes calls straight through — the real retry behavior is covered in retry.test.ts
    const retry = vi.fn(async <T>(fn: () => Promise<T>): Promise<T> => {
      for (let i = 0; i < 5; i++) {
        try { return await fn(); } catch (e) { if (i === 4) throw e; }
      }
      throw new Error('unreachable');
    });
    const service = new GoogleCalendarService(makeCalendar({ insert: mockInsert }), 'primary', makeDeps({ retry }));

    const event = await service.createEvent({ title: 'T', start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z' });

    expect(retry).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(3);
    expect(event).toEqual(NORMALIZED_EVENT);
  });
});

// ---------------------------------------------------------------------------
// updateEvent
// ---------------------------------------------------------------------------

describe('GoogleCalendarService.updateEvent', () => {
  it('calls patch and returns result of deps.normalizeEvent', async () => {
    const mockPatch = vi.fn().mockResolvedValue({ data: MOCK_API_RESPONSE });
    const deps = makeDeps();
    const service = new GoogleCalendarService(makeCalendar({ patch: mockPatch }), 'primary', deps);

    const event = await service.updateEvent('evt-123', { title: 'Updated' });

    expect(mockPatch).toHaveBeenCalledWith(expect.objectContaining({ calendarId: 'primary', eventId: 'evt-123' }));
    expect(event).toEqual(NORMALIZED_EVENT);
  });

  it('only sends fields present in updates (partial patch)', async () => {
    const mockPatch = vi.fn().mockResolvedValue({ data: MOCK_API_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar({ patch: mockPatch }), 'primary', makeDeps());

    await service.updateEvent('evt-123', { title: 'New title' });

    const call = mockPatch.mock.calls[0][0];
    expect(call.requestBody.summary).toBe('New title');
    expect(call.requestBody.start).toBeUndefined();
  });

  it("scope 'this' patches the instance ID as-is", async () => {
    const mockPatch = vi.fn().mockResolvedValue({ data: MOCK_API_RESPONSE });
    const service = new GoogleCalendarService(makeCalendar({ patch: mockPatch }), 'primary', makeDeps());

    await service.updateEvent('master_20260322T090000Z', { title: 'Updated' }, 'this');

    expect(mockPatch).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'master_20260322T090000Z' }));
  });

  it("scope 'all' calls deps.stripRecurrenceSuffix and patches the master", async () => {
    const mockPatch = vi.fn().mockResolvedValue({ data: MOCK_API_RESPONSE });
    const deps = makeDeps();
    const service = new GoogleCalendarService(makeCalendar({ patch: mockPatch }), 'primary', deps);

    await service.updateEvent('master_20260322T090000Z', { title: 'Updated' }, 'all');

    expect(deps.stripRecurrenceSuffix).toHaveBeenCalledWith('master_20260322T090000Z');
    expect(mockPatch).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'master' }));
  });

  it("scope 'this_and_following' throws when eventId has no instance suffix", async () => {
    const service = new GoogleCalendarService(makeCalendar(), 'primary', makeDeps());

    await expect(service.updateEvent('masteronly', { title: 'x' }, 'this_and_following')).rejects.toThrow(
      'this_and_following requires an instance event ID',
    );
  });

  it('throws when deps.normalizeEvent returns null', async () => {
    const mockPatch = vi.fn().mockResolvedValue({ data: { id: 'x' } });
    const deps = makeDeps({ normalizeEvent: vi.fn().mockReturnValue(null) });
    const service = new GoogleCalendarService(makeCalendar({ patch: mockPatch }), 'primary', deps);

    await expect(service.updateEvent('x', { title: 'Bad' })).rejects.toThrow('updateEvent');
  });
});

// ---------------------------------------------------------------------------
// deleteEvent
// ---------------------------------------------------------------------------

describe('GoogleCalendarService.deleteEvent', () => {
  it('calls events.delete with correct calendarId and eventId', async () => {
    const mockDelete = vi.fn().mockResolvedValue({});
    const service = new GoogleCalendarService(makeCalendar({ delete: mockDelete }), 'primary', makeDeps());

    await service.deleteEvent('evt-abc');

    expect(mockDelete).toHaveBeenCalledWith({ calendarId: 'primary', eventId: 'evt-abc' });
  });

  it("scope 'this' deletes the instance ID as-is", async () => {
    const mockDelete = vi.fn().mockResolvedValue({});
    const service = new GoogleCalendarService(makeCalendar({ delete: mockDelete }), 'primary', makeDeps());

    await service.deleteEvent('master_20260322T090000Z', 'this');

    expect(mockDelete).toHaveBeenCalledWith({ calendarId: 'primary', eventId: 'master_20260322T090000Z' });
  });

  it("scope 'all' calls deps.stripRecurrenceSuffix and deletes the master", async () => {
    const mockDelete = vi.fn().mockResolvedValue({});
    const deps = makeDeps();
    const service = new GoogleCalendarService(makeCalendar({ delete: mockDelete }), 'primary', deps);

    await service.deleteEvent('master_20260322T090000Z', 'all');

    expect(deps.stripRecurrenceSuffix).toHaveBeenCalledWith('master_20260322T090000Z');
    expect(mockDelete).toHaveBeenCalledWith({ calendarId: 'primary', eventId: 'master' });
  });

  it("scope 'this_and_following' calls deps.truncateRruleUntil and patches the master", async () => {
    const mockGet = vi.fn().mockResolvedValue({ data: { recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'] } });
    const mockPatch = vi.fn().mockResolvedValue({});
    const deps = makeDeps();
    const service = new GoogleCalendarService(makeCalendar({ get: mockGet, patch: mockPatch }), 'primary', deps);

    await service.deleteEvent('master_20260322T090000Z', 'this_and_following');

    expect(deps.stripRecurrenceSuffix).toHaveBeenCalledWith('master_20260322T090000Z');
    expect(deps.truncateRruleUntil).toHaveBeenCalledWith('RRULE:FREQ=WEEKLY;BYDAY=MO', 'master_20260322T090000Z');
    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary', eventId: 'master',
        requestBody: { recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=STUBBED'] },
      }),
    );
  });

  it("scope 'this_and_following' throws when eventId has no instance suffix", async () => {
    const service = new GoogleCalendarService(makeCalendar(), 'primary', makeDeps());

    await expect(service.deleteEvent('masteronly', 'this_and_following')).rejects.toThrow(
      'this_and_following requires an instance event ID',
    );
  });
});

// ---------------------------------------------------------------------------
// defaultDeps wiring — verifies the service works without explicit deps
// ---------------------------------------------------------------------------

describe('GoogleCalendarService with defaultDeps', () => {
  it('uses real normalizeEvent when no deps are provided', async () => {
    const rawEvent: calendar_v3.Schema$Event = {
      id: 'evt-1',
      summary: 'Real event',
      start: { dateTime: '2026-03-22T09:00:00Z' },
      end: { dateTime: '2026-03-22T09:30:00Z' },
    };
    const mockList = vi.fn().mockResolvedValue({ data: { items: [rawEvent] } });
    const service = new GoogleCalendarService(makeCalendar({ list: mockList }));

    const events = await service.getEvents(new Date('2026-03-22T00:00:00Z'), new Date('2026-03-22T23:59:59Z'));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(normalizeEvent(rawEvent));
    expect(events[0].title).toBe('Real event');
  });
});
