import { useState, useEffect } from 'react';
import { authenticatedApi } from '../lib/apiInstance';
import { useCalendarStore } from '../stores/calendar';
import type { CalendarInfo } from '../lib/api';

export type { CalendarInfo };

export function useCalendars() {
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    authenticatedApi.getCalendars()
      .then((res) => {
        setCalendars(res.calendars);
        // Re-validate stored calendarId against the fresh list using getState()
        // to read the current value at call-time, not the value captured at mount.
        const { calendarId, setCalendar } = useCalendarStore.getState();
        const match = res.calendars.find((c) => c.id === calendarId);
        if (!match) {
          const primary = res.calendars.find((c) => c.primary) ?? res.calendars[0];
          setCalendar(primary?.id ?? 'primary', primary?.summary ?? null);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return { calendars, loading, error };
}
