import { vi } from 'vitest';
import type { calendar_v3 } from 'googleapis';

interface CalendarFixtureEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: Array<{ email: string; responseStatus?: string }>;
  location?: string;
  description?: string;
  recurrence?: string[];
}

/**
 * Creates a mock calendar_v3.Calendar object that returns fixture data.
 * GoogleCalendarService wraps this, so its mappers and logic are exercised for real.
 */
export function createMockCalendarApi(events: CalendarFixtureEvent[] = []) {
  let insertCounter = 0;

  const mockApi = {
    events: {
      list: vi.fn().mockResolvedValue({ data: { items: events } }),
      insert: vi.fn().mockImplementation(
        (params: { requestBody: calendar_v3.Schema$Event }) =>
          Promise.resolve({ data: { id: `created-${++insertCounter}`, ...params.requestBody } }),
      ),
      patch: vi.fn().mockImplementation(
        (params: { eventId: string; requestBody: calendar_v3.Schema$Event }) =>
          Promise.resolve({ data: { id: params.eventId, ...params.requestBody } }),
      ),
      delete: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockImplementation(
        (params: { eventId: string }) =>
          Promise.resolve({ data: events.find((e) => e.id === params.eventId) ?? { id: params.eventId } }),
      ),
    },
    freebusy: {
      query: vi.fn().mockResolvedValue({ data: { calendars: {} } }),
    },
    calendarList: {
      list: vi.fn().mockResolvedValue({ data: { items: [] } }),
    },
  };

  return mockApi as unknown as calendar_v3.Calendar;
}
