import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCalendars } from './useCalendars';
import { useCalendarStore } from '../stores/calendar';

vi.mock('../lib/apiInstance', () => ({
  authenticatedApi: {
    getCalendars: vi.fn(),
  },
}));

import { authenticatedApi } from '../lib/apiInstance';

const mockGetCalendars = vi.mocked(authenticatedApi.getCalendars);

beforeEach(() => {
  vi.clearAllMocks();
  useCalendarStore.getState().clearCalendar();
});

const CALENDARS = [
  { id: 'cal-1', summary: 'Work', primary: true },
  { id: 'cal-2', summary: 'Personal', primary: false },
];

describe('useCalendars', () => {
  it('starts in loading state', () => {
    mockGetCalendars.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCalendars());
    expect(result.current.loading).toBe(true);
    expect(result.current.calendars).toEqual([]);
    expect(result.current.error).toBe(false);
  });

  it('populates calendars on success', async () => {
    mockGetCalendars.mockResolvedValue({ calendars: CALENDARS });
    const { result } = renderHook(() => useCalendars());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.calendars).toEqual(CALENDARS);
    expect(result.current.error).toBe(false);
  });

  it('sets error on failure', async () => {
    mockGetCalendars.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useCalendars());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.calendars).toEqual([]);
  });

  it('selects primary calendar when no stored calendarId matches', async () => {
    mockGetCalendars.mockResolvedValue({ calendars: CALENDARS });
    const { result } = renderHook(() => useCalendars());

    await waitFor(() => expect(result.current.loading).toBe(false));
    const { calendarId, calendarName } = useCalendarStore.getState();
    expect(calendarId).toBe('cal-1');
    expect(calendarName).toBe('Work');
  });

  it('keeps stored calendarId when it matches a fetched calendar', async () => {
    useCalendarStore.getState().setCalendar('cal-2', 'Personal');
    mockGetCalendars.mockResolvedValue({ calendars: CALENDARS });
    const { result } = renderHook(() => useCalendars());

    await waitFor(() => expect(result.current.loading).toBe(false));
    const { calendarId } = useCalendarStore.getState();
    expect(calendarId).toBe('cal-2');
  });

  it('falls back to first calendar when none is primary', async () => {
    const noPrimary = [
      { id: 'cal-a', summary: 'First', primary: false },
      { id: 'cal-b', summary: 'Second', primary: false },
    ];
    mockGetCalendars.mockResolvedValue({ calendars: noPrimary });
    const { result } = renderHook(() => useCalendars());

    await waitFor(() => expect(result.current.loading).toBe(false));
    const { calendarId } = useCalendarStore.getState();
    expect(calendarId).toBe('cal-a');
  });
});
