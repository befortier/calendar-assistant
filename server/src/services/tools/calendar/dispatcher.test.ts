import { describe, it, expect, vi } from 'vitest';
import { makeCalendarToolDispatcher } from './dispatcher';
import type { GoogleCalendarService } from './google';
import type { SSEEmitter } from '../../sse';

const noopEmit: SSEEmitter = vi.fn();

const START = '2026-03-22T00:00:00.000Z';
const END = '2026-03-22T23:59:59.000Z';

function makeService(overrides?: Partial<Record<keyof GoogleCalendarService, unknown>>): GoogleCalendarService {
  return {
    getEvents: vi.fn().mockResolvedValue([]),
    getFreeBusy: vi.fn().mockResolvedValue({}),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as GoogleCalendarService;
}

// ---------------------------------------------------------------------------
// get_events
// ---------------------------------------------------------------------------

describe('CalendarToolDispatcher: get_events', () => {
  it('calls service.getEvents with Date objects and returns JSON array', async () => {
    const mockGetEvents = vi.fn().mockResolvedValue([
      { id: 'e1', title: 'Standup', start: '2026-03-22T09:00:00Z', end: '2026-03-22T09:30:00Z', allDay: false },
    ]);
    const dispatcher = makeCalendarToolDispatcher(makeService({ getEvents: mockGetEvents }), noopEmit);

    const result = await dispatcher.dispatch('get_events', { start: START, end: END });

    expect(mockGetEvents).toHaveBeenCalledWith(new Date(START), new Date(END));
    expect(JSON.parse(result)).toEqual([
      { id: 'e1', title: 'Standup', start: '2026-03-22T09:00:00Z', end: '2026-03-22T09:30:00Z', allDay: false },
    ]);
  });
});

// ---------------------------------------------------------------------------
// get_freebusy
// ---------------------------------------------------------------------------

describe('CalendarToolDispatcher: get_freebusy', () => {
  it('calls service.getFreeBusy with email array and Date objects', async () => {
    const mockGetFreeBusy = vi.fn().mockResolvedValue({
      'a@x.com': { accessible: true, status: 'ok', busy: [] },
    });
    const dispatcher = makeCalendarToolDispatcher(makeService({ getFreeBusy: mockGetFreeBusy }), noopEmit);

    await dispatcher.dispatch('get_freebusy', { emails: ['a@x.com'], start: START, end: END });

    expect(mockGetFreeBusy).toHaveBeenCalledWith(['a@x.com'], new Date(START), new Date(END));
  });

  it('enriches accessible calendars with free slots', async () => {
    const mockGetFreeBusy = vi.fn().mockResolvedValue({
      'a@x.com': {
        accessible: true,
        status: 'ok',
        busy: [{ start: '2026-03-22T09:00:00Z', end: '2026-03-22T10:00:00Z' }],
      },
    });
    const dispatcher = makeCalendarToolDispatcher(makeService({ getFreeBusy: mockGetFreeBusy }), noopEmit);

    const result = JSON.parse(
      await dispatcher.dispatch('get_freebusy', { emails: ['a@x.com'], start: START, end: END }),
    );

    expect(result['a@x.com'].free).toBeDefined();
    expect(result['a@x.com'].free.length).toBeGreaterThan(0);
  });

  it('returns empty free array for inaccessible calendars', async () => {
    const mockGetFreeBusy = vi.fn().mockResolvedValue({
      'private@x.com': {
        accessible: false,
        status: 'not_found',
        busy: [],
        errors: [{ domain: 'global', reason: 'notFound' }],
      },
    });
    const dispatcher = makeCalendarToolDispatcher(makeService({ getFreeBusy: mockGetFreeBusy }), noopEmit);

    const result = JSON.parse(
      await dispatcher.dispatch('get_freebusy', { emails: ['private@x.com'], start: START, end: END }),
    );

    expect(result['private@x.com'].free).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// create_event
// ---------------------------------------------------------------------------

describe('CalendarToolDispatcher: create_event', () => {
  it('calls service.createEvent with input and returns JSON event', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      id: 'new-evt',
      title: 'Team sync',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
      allDay: false,
    });
    const dispatcher = makeCalendarToolDispatcher(makeService({ createEvent: mockCreate }), noopEmit);

    const result = await dispatcher.dispatch('create_event', {
      title: 'Team sync',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      title: 'Team sync',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
    });
    expect(JSON.parse(result).id).toBe('new-evt');
  });

  it('forwards recurrence array to service.createEvent', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      id: 'rec-evt', title: 'Weekly sync',
      start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z', allDay: false,
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
    });
    const dispatcher = makeCalendarToolDispatcher(makeService({ createEvent: mockCreate }), noopEmit);

    await dispatcher.dispatch('create_event', {
      title: 'Weekly sync',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'] }),
    );
  });

  it('forwards reminders array to service.createEvent', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      id: 'rem-evt', title: 'Team sync',
      start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z', allDay: false,
    });
    const dispatcher = makeCalendarToolDispatcher(makeService({ createEvent: mockCreate }), noopEmit);

    await dispatcher.dispatch('create_event', {
      title: 'Team sync',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
      reminders: [{ method: 'popup', minutes: 15 }],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ reminders: [{ method: 'popup', minutes: 15 }] }),
    );
  });

  it('forwards allDay boolean to service.createEvent', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      id: 'allday-evt', title: 'Company holiday',
      start: '2026-03-22', end: '2026-03-23', allDay: true,
    });
    const dispatcher = makeCalendarToolDispatcher(makeService({ createEvent: mockCreate }), noopEmit);

    await dispatcher.dispatch('create_event', {
      title: 'Company holiday',
      start: '2026-03-22',
      end: '2026-03-23',
      allDay: true,
    });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ allDay: true }));
  });
});

// ---------------------------------------------------------------------------
// update_event
// ---------------------------------------------------------------------------

describe('CalendarToolDispatcher: update_event', () => {
  it('calls service.updateEvent with id and updates, returns JSON event', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({
      id: 'evt-123', title: 'New title',
      start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z', allDay: false,
    });
    const dispatcher = makeCalendarToolDispatcher(makeService({ updateEvent: mockUpdate }), noopEmit);

    const result = await dispatcher.dispatch('update_event', { id: 'evt-123', title: 'New title' });

    expect(mockUpdate).toHaveBeenCalledWith('evt-123', { title: 'New title' }, undefined);
    expect(JSON.parse(result).id).toBe('evt-123');
  });
});

// ---------------------------------------------------------------------------
// delete_event
// ---------------------------------------------------------------------------

describe('CalendarToolDispatcher: delete_event', () => {
  it('calls service.deleteEvent with id and returns success', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const dispatcher = makeCalendarToolDispatcher(makeService({ deleteEvent: mockDelete }), noopEmit);

    const result = await dispatcher.dispatch('delete_event', { id: 'evt-abc' });

    expect(mockDelete).toHaveBeenCalledWith('evt-abc', undefined);
    expect(JSON.parse(result)).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// update_event — recurrence_scope
// ---------------------------------------------------------------------------

describe('CalendarToolDispatcher: update_event with recurrence_scope', () => {
  it("throws when recurrence_scope is 'this_and_following' (not supported for updates)", async () => {
    const dispatcher = makeCalendarToolDispatcher(makeService(), noopEmit);

    await expect(
      dispatcher.dispatch('update_event', { id: 'master_20260322T090000Z', recurrence_scope: 'this_and_following' }),
    ).rejects.toThrow("this_and_following is not supported for update_event");
  });

  it('passes recurrence_scope to service.updateEvent', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({
      id: 'master_20260322T090000Z', title: 'Updated',
      start: '2026-03-22T09:00:00Z', end: '2026-03-22T09:30:00Z', allDay: false,
    });
    const dispatcher = makeCalendarToolDispatcher(makeService({ updateEvent: mockUpdate }), noopEmit);

    await dispatcher.dispatch('update_event', {
      id: 'master_20260322T090000Z', title: 'Updated', recurrence_scope: 'this',
    });

    expect(mockUpdate).toHaveBeenCalledWith('master_20260322T090000Z', { title: 'Updated' }, 'this');
  });

  it('passes undefined scope when recurrence_scope is absent', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({
      id: 'evt-123', title: 'New title',
      start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z', allDay: false,
    });
    const dispatcher = makeCalendarToolDispatcher(makeService({ updateEvent: mockUpdate }), noopEmit);

    await dispatcher.dispatch('update_event', { id: 'evt-123', title: 'New title' });

    expect(mockUpdate).toHaveBeenCalledWith('evt-123', { title: 'New title' }, undefined);
  });
});

// ---------------------------------------------------------------------------
// delete_event — recurrence_scope
// ---------------------------------------------------------------------------

describe('CalendarToolDispatcher: delete_event with recurrence_scope', () => {
  it('passes recurrence_scope to service.deleteEvent', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const dispatcher = makeCalendarToolDispatcher(makeService({ deleteEvent: mockDelete }), noopEmit);

    await dispatcher.dispatch('delete_event', { id: 'master_20260322T090000Z', recurrence_scope: 'all' });

    expect(mockDelete).toHaveBeenCalledWith('master_20260322T090000Z', 'all');
  });

  it('passes undefined scope when recurrence_scope is absent', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const dispatcher = makeCalendarToolDispatcher(makeService({ deleteEvent: mockDelete }), noopEmit);

    await dispatcher.dispatch('delete_event', { id: 'evt-abc' });

    expect(mockDelete).toHaveBeenCalledWith('evt-abc', undefined);
  });
});

// ---------------------------------------------------------------------------
// recurrence_scope validation
// ---------------------------------------------------------------------------

describe('CalendarToolDispatcher: recurrence_scope validation', () => {
  it('throws when update_event has an invalid recurrence_scope value', async () => {
    const dispatcher = makeCalendarToolDispatcher(makeService(), noopEmit);

    await expect(
      dispatcher.dispatch('update_event', { id: 'evt-123', recurrence_scope: 'allEvents' }),
    ).rejects.toThrow("invalid recurrence_scope 'allEvents'");
  });

  it('throws when delete_event has an invalid recurrence_scope value', async () => {
    const dispatcher = makeCalendarToolDispatcher(makeService(), noopEmit);

    await expect(
      dispatcher.dispatch('delete_event', { id: 'evt-abc', recurrence_scope: 'series' }),
    ).rejects.toThrow("invalid recurrence_scope 'series'");
  });
});

// ---------------------------------------------------------------------------
// unknown tool
// ---------------------------------------------------------------------------

describe('CalendarToolDispatcher: unknown tool', () => {
  it('throws for an unrecognised tool name', async () => {
    const dispatcher = makeCalendarToolDispatcher(makeService(), noopEmit);

    await expect(dispatcher.dispatch('nonexistent', {})).rejects.toThrow('Unknown tool: nonexistent');
  });
});

// ---------------------------------------------------------------------------
// input validation (delegated to llmInputValidation)
// ---------------------------------------------------------------------------

describe('CalendarToolDispatcher: input validation', () => {
  it('throws when a required string field is missing', async () => {
    const dispatcher = makeCalendarToolDispatcher(makeService(), noopEmit);

    await expect(dispatcher.dispatch('get_events', { start: START })).rejects.toThrow(
      "expected string for 'end'",
    );
  });

  it('throws when a required string field is a number', async () => {
    const dispatcher = makeCalendarToolDispatcher(makeService(), noopEmit);

    await expect(dispatcher.dispatch('get_events', { start: START, end: 12345 })).rejects.toThrow(
      "expected string for 'end'",
    );
  });

  it('throws when emails is not a string array', async () => {
    const dispatcher = makeCalendarToolDispatcher(makeService(), noopEmit);

    await expect(
      dispatcher.dispatch('get_freebusy', { emails: 'not-an-array', start: START, end: END }),
    ).rejects.toThrow("expected string[] for 'emails'");
  });

  it('throws when a date string is not valid ISO 8601', async () => {
    const dispatcher = makeCalendarToolDispatcher(makeService(), noopEmit);

    await expect(
      dispatcher.dispatch('get_events', { start: 'not-a-date', end: END }),
    ).rejects.toThrow("invalid ISO 8601 date for 'start'");
  });

  it('throws when create_event is missing title', async () => {
    const dispatcher = makeCalendarToolDispatcher(makeService(), noopEmit);

    await expect(
      dispatcher.dispatch('create_event', { start: START, end: END }),
    ).rejects.toThrow("expected string for 'title'");
  });

  it('throws when delete_event is missing id', async () => {
    const dispatcher = makeCalendarToolDispatcher(makeService(), noopEmit);

    await expect(dispatcher.dispatch('delete_event', {})).rejects.toThrow(
      "expected string for 'id'",
    );
  });
});
