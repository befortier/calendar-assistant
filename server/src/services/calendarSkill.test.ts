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
});

// ---------------------------------------------------------------------------
// update_event
// ---------------------------------------------------------------------------

describe('dispatchTool: update_event', () => {
  it('calls service.updateEvent with event_id and updates, returns JSON event', async () => {
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
      { event_id: 'evt-123', title: 'New title' },
      service,
    );

    expect(mockUpdate).toHaveBeenCalledWith('evt-123', { title: 'New title' });
    expect(JSON.parse(result).id).toBe('evt-123');
  });
});

// ---------------------------------------------------------------------------
// delete_event
// ---------------------------------------------------------------------------

describe('dispatchTool: delete_event', () => {
  it('calls service.deleteEvent with event_id and returns success', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const service = makeService({ deleteEvent: mockDelete });

    const result = await dispatchTool('delete_event', { event_id: 'evt-abc' }, service);

    expect(mockDelete).toHaveBeenCalledWith('evt-abc');
    expect(JSON.parse(result)).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// unknown tool
// ---------------------------------------------------------------------------

describe('dispatchTool: unknown tool', () => {
  it('throws for an unrecognised tool name', async () => {
    const service = makeService();

    await expect(dispatchTool('nonexistent', {}, service)).rejects.toThrow('Unknown tool: nonexistent');
  });
});
