import { describe, it, expect, vi } from 'vitest';
import { dispatchTool } from './calendarSkill';
import type { GoogleCalendarService } from './googleCalendar';

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

describe('dispatchTool: get_events', () => {
  it('calls service.getEvents with Date objects and returns JSON array', async () => {
    const mockGetEvents = vi.fn().mockResolvedValue([
      { id: 'e1', title: 'Standup', start: '2026-03-22T09:00:00Z', end: '2026-03-22T09:30:00Z', allDay: false },
    ]);
    const service = makeService({ getEvents: mockGetEvents });

    const result = await dispatchTool('get_events', { start: START, end: END }, service);

    expect(mockGetEvents).toHaveBeenCalledWith(new Date(START), new Date(END));
    expect(JSON.parse(result)).toEqual([
      { id: 'e1', title: 'Standup', start: '2026-03-22T09:00:00Z', end: '2026-03-22T09:30:00Z', allDay: false },
    ]);
  });
});

// ---------------------------------------------------------------------------
// get_freebusy
// ---------------------------------------------------------------------------

describe('dispatchTool: get_freebusy', () => {
  it('calls service.getFreeBusy with email array and Date objects', async () => {
    const mockGetFreeBusy = vi.fn().mockResolvedValue({
      'a@x.com': { accessible: true, status: 'ok', busy: [] },
    });
    const service = makeService({ getFreeBusy: mockGetFreeBusy });

    await dispatchTool('get_freebusy', { emails: ['a@x.com'], start: START, end: END }, service);

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
    const service = makeService({ getFreeBusy: mockGetFreeBusy });

    const result = JSON.parse(
      await dispatchTool('get_freebusy', { emails: ['a@x.com'], start: START, end: END }, service),
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
    const service = makeService({ getFreeBusy: mockGetFreeBusy });

    const result = JSON.parse(
      await dispatchTool('get_freebusy', { emails: ['private@x.com'], start: START, end: END }, service),
    );

    expect(result['private@x.com'].free).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// create_event
// ---------------------------------------------------------------------------

describe('dispatchTool: create_event', () => {
  it('calls service.createEvent with input and returns JSON event', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      id: 'new-evt',
      title: 'Team sync',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
      allDay: false,
    });
    const service = makeService({ createEvent: mockCreate });

    const result = await dispatchTool(
      'create_event',
      { title: 'Team sync', start: '2026-03-22T10:00:00Z', end: '2026-03-22T10:30:00Z' },
      service,
    );

    expect(mockCreate).toHaveBeenCalledWith({
      title: 'Team sync',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
    });
    expect(JSON.parse(result).id).toBe('new-evt');
  });

  it('forwards recurrence array to service.createEvent', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      id: 'rec-evt',
      title: 'Weekly sync',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
      allDay: false,
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
    });
    const service = makeService({ createEvent: mockCreate });

    await dispatchTool(
      'create_event',
      {
        title: 'Weekly sync',
        start: '2026-03-22T10:00:00Z',
        end: '2026-03-22T10:30:00Z',
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
      },
      service,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'] }),
    );
  });

  it('forwards reminders array to service.createEvent', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      id: 'rem-evt',
      title: 'Team sync',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
      allDay: false,
    });
    const service = makeService({ createEvent: mockCreate });

    await dispatchTool(
      'create_event',
      {
        title: 'Team sync',
        start: '2026-03-22T10:00:00Z',
        end: '2026-03-22T10:30:00Z',
        reminders: [{ method: 'popup', minutes: 15 }],
      },
      service,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ reminders: [{ method: 'popup', minutes: 15 }] }),
    );
  });

  it('forwards allDay boolean to service.createEvent', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      id: 'allday-evt',
      title: 'Company holiday',
      start: '2026-03-22',
      end: '2026-03-23',
      allDay: true,
    });
    const service = makeService({ createEvent: mockCreate });

    await dispatchTool(
      'create_event',
      {
        title: 'Company holiday',
        start: '2026-03-22',
        end: '2026-03-23',
        allDay: true,
      },
      service,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allDay: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// update_event
// ---------------------------------------------------------------------------

describe('dispatchTool: update_event', () => {
  it('calls service.updateEvent with id and updates, returns JSON event', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({
      id: 'evt-123',
      title: 'New title',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
      allDay: false,
    });
    const service = makeService({ updateEvent: mockUpdate });

    const result = await dispatchTool(
      'update_event',
      { id: 'evt-123', title: 'New title' },
      service,
    );

    expect(mockUpdate).toHaveBeenCalledWith('evt-123', { title: 'New title' }, undefined);
    expect(JSON.parse(result).id).toBe('evt-123');
  });
});

// ---------------------------------------------------------------------------
// delete_event
// ---------------------------------------------------------------------------

describe('dispatchTool: delete_event', () => {
  it('calls service.deleteEvent with id and returns success', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const service = makeService({ deleteEvent: mockDelete });

    const result = await dispatchTool('delete_event', { id: 'evt-abc' }, service);

    expect(mockDelete).toHaveBeenCalledWith('evt-abc', undefined);
    expect(JSON.parse(result)).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// update_event — recurrence_scope
// ---------------------------------------------------------------------------

describe('dispatchTool: update_event with recurrence_scope', () => {
  it("throws when recurrence_scope is 'this_and_following' (not supported for updates)", async () => {
    const service = makeService();

    await expect(
      dispatchTool('update_event', { id: 'master_20260322T090000Z', recurrence_scope: 'this_and_following' }, service),
    ).rejects.toThrow("this_and_following is not supported for update_event");
  });

  it('passes recurrence_scope to service.updateEvent', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({
      id: 'master_20260322T090000Z',
      title: 'Updated',
      start: '2026-03-22T09:00:00Z',
      end: '2026-03-22T09:30:00Z',
      allDay: false,
    });
    const service = makeService({ updateEvent: mockUpdate });

    await dispatchTool(
      'update_event',
      { id: 'master_20260322T090000Z', title: 'Updated', recurrence_scope: 'this' },
      service,
    );

    expect(mockUpdate).toHaveBeenCalledWith('master_20260322T090000Z', { title: 'Updated' }, 'this');
  });

  it('passes undefined scope when recurrence_scope is absent', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({
      id: 'evt-123',
      title: 'New title',
      start: '2026-03-22T10:00:00Z',
      end: '2026-03-22T10:30:00Z',
      allDay: false,
    });
    const service = makeService({ updateEvent: mockUpdate });

    await dispatchTool('update_event', { id: 'evt-123', title: 'New title' }, service);

    expect(mockUpdate).toHaveBeenCalledWith('evt-123', { title: 'New title' }, undefined);
  });
});

// ---------------------------------------------------------------------------
// delete_event — recurrence_scope
// ---------------------------------------------------------------------------

describe('dispatchTool: delete_event with recurrence_scope', () => {
  it('passes recurrence_scope to service.deleteEvent', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const service = makeService({ deleteEvent: mockDelete });

    await dispatchTool('delete_event', { id: 'master_20260322T090000Z', recurrence_scope: 'all' }, service);

    expect(mockDelete).toHaveBeenCalledWith('master_20260322T090000Z', 'all');
  });

  it('passes undefined scope when recurrence_scope is absent', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const service = makeService({ deleteEvent: mockDelete });

    await dispatchTool('delete_event', { id: 'evt-abc' }, service);

    expect(mockDelete).toHaveBeenCalledWith('evt-abc', undefined);
  });
});

// ---------------------------------------------------------------------------
// recurrence_scope validation
// ---------------------------------------------------------------------------

describe('dispatchTool: recurrence_scope validation', () => {
  it('throws when update_event has an invalid recurrence_scope value', async () => {
    const service = makeService();

    await expect(
      dispatchTool('update_event', { id: 'evt-123', recurrence_scope: 'allEvents' }, service),
    ).rejects.toThrow("invalid recurrence_scope 'allEvents'");
  });

  it('throws when delete_event has an invalid recurrence_scope value', async () => {
    const service = makeService();

    await expect(
      dispatchTool('delete_event', { id: 'evt-abc', recurrence_scope: 'series' }, service),
    ).rejects.toThrow("invalid recurrence_scope 'series'");
  });
});

// ---------------------------------------------------------------------------
// unknown tool
// ---------------------------------------------------------------------------

describe('dispatchTool: unknown tool', () => {
  it('throws for an unrecognised tool name', async () => {
    const service = makeService();

    await expect(dispatchTool('nonexistent', {}, service)).rejects.toThrow(
      'Unknown tool: nonexistent',
    );
  });
});

// ---------------------------------------------------------------------------
// input validation
// ---------------------------------------------------------------------------

describe('dispatchTool: input validation', () => {
  it('throws when a required string field is missing', async () => {
    const service = makeService();

    await expect(dispatchTool('get_events', { start: START }, service)).rejects.toThrow(
      "expected string for 'end'",
    );
  });

  it('throws when a required string field is a number', async () => {
    const service = makeService();

    await expect(
      dispatchTool('get_events', { start: START, end: 12345 }, service),
    ).rejects.toThrow("expected string for 'end'");
  });

  it('throws when emails is not a string array', async () => {
    const service = makeService();

    await expect(
      dispatchTool('get_freebusy', { emails: 'not-an-array', start: START, end: END }, service),
    ).rejects.toThrow("expected string[] for 'emails'");
  });

  it('throws when a date string is not valid ISO 8601', async () => {
    const service = makeService();

    await expect(
      dispatchTool('get_events', { start: 'not-a-date', end: END }, service),
    ).rejects.toThrow("invalid ISO 8601 date for 'start'");
  });

  it('throws when create_event is missing title', async () => {
    const service = makeService();

    await expect(
      dispatchTool('create_event', { start: START, end: END }, service),
    ).rejects.toThrow("expected string for 'title'");
  });

  it('throws when delete_event is missing id', async () => {
    const service = makeService();

    await expect(dispatchTool('delete_event', {}, service)).rejects.toThrow(
      "expected string for 'id'",
    );
  });
});
