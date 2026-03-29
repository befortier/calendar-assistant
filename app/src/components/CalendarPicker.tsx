import { useMemo, useState } from 'react';
import { useCalendars } from '../hooks/useCalendars';
import { useCalendarStore } from '../stores/calendar';
import type { CalendarInfo } from '../lib/api';

interface Props {
  hasMessages: boolean;
  onNewChat: () => void;
}

export default function CalendarPicker({ hasMessages, onNewChat }: Props) {
  const { calendars, loading, error } = useCalendars();
  const { calendarId, setCalendar } = useCalendarStore();
  const [pending, setPending] = useState<CalendarInfo | null>(null);

  const activeCalendar = useMemo(
    () => calendars.find((c) => c.id === calendarId),
    [calendars, calendarId],
  );

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = calendars.find((c) => c.id === e.target.value);
    if (!selected) return;
    if (hasMessages) {
      setPending(selected);
    } else {
      setCalendar(selected.id, selected.summary);
    }
  };

  const confirmSwitch = () => {
    if (!pending) return;
    onNewChat();
    setCalendar(pending.id, pending.summary);
    setPending(null);
  };

  const dismissSwitch = () => setPending(null);

  return (
    <>
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

      {pending && (
        // Backdrop: click dismisses. Escape is handled by the inner dialog only.
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={dismissSwitch}
        >
          {/* onClick stops backdrop click from bubbling; onKeyDown handles Escape */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-switch-title"
            aria-describedby="calendar-switch-desc"
            className="mx-4 max-w-sm rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); dismissSwitch(); } }}
          >
            <h2 id="calendar-switch-title" className="text-base font-semibold text-gray-900">
              Switch calendar?
            </h2>
            <p id="calendar-switch-desc" className="mt-2 text-sm text-gray-600">
              Changing calendars mid-conversation can confuse the assistant. Starting a new chat is recommended.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={dismissSwitch}
                autoFocus
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={confirmSwitch}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                New Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
