import { useMemo } from 'react';
import { useCalendars } from '../hooks/useCalendars';
import { useCalendarStore } from '../stores/calendar';

export default function CalendarPicker() {
  const { calendars, loading, error } = useCalendars();
  const { calendarId, setCalendar } = useCalendarStore();

  const activeCalendar = useMemo(
    () => calendars.find((c) => c.id === calendarId),
    [calendars, calendarId],
  );

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = calendars.find((c) => c.id === e.target.value);
    setCalendar(selected?.id ?? 'primary', selected?.summary ?? null);
  };

  return (
    <div className="flex items-center gap-1.5">
      {!loading && calendars.length > 0 && (
        <div
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: activeCalendar?.backgroundColor ?? '#4285f4' }}
          aria-hidden="true"
        />
      )}
      <select
        value={calendarId}
        onChange={handleChange}
        disabled={loading || error || calendars.length === 0}
        aria-label="Active calendar"
        className="max-w-[160px] truncate bg-transparent text-sm text-gray-600 focus:outline-none disabled:opacity-50"
      >
        {loading || error || calendars.length === 0 ? (
          <option value={calendarId}>{loading ? 'Loading…' : error ? 'Calendars unavailable' : 'Primary Calendar'}</option>
        ) : (
          calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.summary}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
