import { useState, useEffect } from 'react';
import { authenticatedApi } from '../lib/apiInstance';
import { useCalendarStore } from '../stores/calendar';
import type { CalendarInfo } from '../lib/api';

export type { CalendarInfo };

export function useCalendars() {
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const { calendarId, setCalendar } = useCalendarStore();

  useEffect(() => {
    authenticatedApi.getCalendars()
      .then((res) => {
        setCalendars(res.calendars);
        // Re-validate stored calendarId against the fresh list
        const match = res.calendars.find((c) => c.id === calendarId);
        if (!match) {
          const primary = res.calendars.find((c) => c.primary) ?? res.calendars[0];
          setCalendar(primary?.id ?? 'primary', primary?.summary ?? null);
        }
      })
      .catch(() => {
        // On error keep whatever is in the store — don't wipe the selection
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { calendars, loading };
}
