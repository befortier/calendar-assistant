import { create } from 'zustand';

const CALENDAR_ID_KEY = 'calendarId';
const CALENDAR_NAME_KEY = 'calendarName';

interface CalendarState {
  calendarId: string;
  calendarName: string | null;
  setCalendar: (id: string, name: string | null) => void;
  clearCalendar: () => void;
}

export const useCalendarStore = create<CalendarState>((set) => ({
  calendarId: localStorage.getItem(CALENDAR_ID_KEY) ?? 'primary',
  calendarName: localStorage.getItem(CALENDAR_NAME_KEY) ?? null,
  setCalendar: (id, name) => {
    localStorage.setItem(CALENDAR_ID_KEY, id);
    if (name) localStorage.setItem(CALENDAR_NAME_KEY, name);
    else localStorage.removeItem(CALENDAR_NAME_KEY);
    set({ calendarId: id, calendarName: name });
  },
  clearCalendar: () => {
    localStorage.removeItem(CALENDAR_ID_KEY);
    localStorage.removeItem(CALENDAR_NAME_KEY);
    set({ calendarId: 'primary', calendarName: null });
  },
}));
