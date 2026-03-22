import { describe, it, expect, vi } from 'vitest';
import { GoogleCalendarService } from './googleCalendar';
import type { calendar_v3 } from 'googleapis';

function makeCalendar(items: calendar_v3.Schema$Event[]): calendar_v3.Calendar {
  return {
    events: {
      list: vi.fn().mockResolvedValue({ data: { items } }),
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
      },
    ]);
  });

  it('returns empty array when items is undefined', async () => {
    const calendar = {
      events: { list: vi.fn().mockResolvedValue({ data: {} }) },
    } as unknown as calendar_v3.Calendar;
    const service = new GoogleCalendarService(calendar);

    const events = await service.getEvents(START, END);

    expect(events).toEqual([]);
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

describe('GoogleCalendarService.getFreeSlots', () => {
  it('returns the full range as one free slot when there are no events', async () => {
    const service = new GoogleCalendarService(makeCalendar([]));
    const slots = await service.getFreeSlots(START, END);

    expect(slots).toEqual([{ start: START.toISOString(), end: END.toISOString() }]);
  });

  it('returns gap between two events', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        {
          id: 'e1',
          summary: 'Morning meeting',
          start: { dateTime: '2026-03-22T09:00:00Z' },
          end: { dateTime: '2026-03-22T10:00:00Z' },
        },
        {
          id: 'e2',
          summary: 'Afternoon meeting',
          start: { dateTime: '2026-03-22T14:00:00Z' },
          end: { dateTime: '2026-03-22T15:00:00Z' },
        },
      ]),
    );

    const slots = await service.getFreeSlots(START, END);

    expect(slots).toEqual([
      { start: START.toISOString(), end: '2026-03-22T09:00:00.000Z' },
      { start: '2026-03-22T10:00:00.000Z', end: '2026-03-22T14:00:00.000Z' },
      { start: '2026-03-22T15:00:00.000Z', end: END.toISOString() },
    ]);
  });

  it('merges overlapping events before computing free slots', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        {
          id: 'e1',
          summary: 'Meeting A',
          start: { dateTime: '2026-03-22T09:00:00Z' },
          end: { dateTime: '2026-03-22T11:00:00Z' },
        },
        {
          id: 'e2',
          summary: 'Meeting B',
          start: { dateTime: '2026-03-22T10:00:00Z' },
          end: { dateTime: '2026-03-22T12:00:00Z' },
        },
      ]),
    );

    const slots = await service.getFreeSlots(START, END);

    expect(slots).toEqual([
      { start: START.toISOString(), end: '2026-03-22T09:00:00.000Z' },
      { start: '2026-03-22T12:00:00.000Z', end: END.toISOString() },
    ]);
  });

  it('returns empty array when a single event spans the full range', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        {
          id: 'e1',
          summary: 'All day block',
          start: { dateTime: START.toISOString() },
          end: { dateTime: END.toISOString() },
        },
      ]),
    );

    const slots = await service.getFreeSlots(START, END);

    expect(slots).toEqual([]);
  });

  it('skips all-day events when computing free slots', async () => {
    const service = new GoogleCalendarService(
      makeCalendar([
        {
          id: 'day1',
          summary: 'Holiday',
          start: { date: '2026-03-22' },
          end: { date: '2026-03-23' },
        },
      ]),
    );

    const slots = await service.getFreeSlots(START, END);

    // All-day events don't occupy timed slots
    expect(slots).toEqual([{ start: START.toISOString(), end: END.toISOString() }]);
  });
});
