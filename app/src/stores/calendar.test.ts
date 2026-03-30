import { describe, it, expect, beforeEach } from 'vitest';
import { useCalendarStore } from './calendar';

beforeEach(() => {
  localStorage.clear();
  useCalendarStore.setState({ calendarId: 'primary', calendarName: null });
});

describe('useCalendarStore', () => {
  describe('initial state', () => {
    it('defaults calendarId to primary', () => {
      expect(useCalendarStore.getState().calendarId).toBe('primary');
    });

    it('defaults calendarName to null', () => {
      expect(useCalendarStore.getState().calendarName).toBeNull();
    });
  });

  describe('setCalendar', () => {
    it('sets id and name in state and localStorage', () => {
      useCalendarStore.getState().setCalendar('cal-123', 'Work');

      expect(useCalendarStore.getState().calendarId).toBe('cal-123');
      expect(useCalendarStore.getState().calendarName).toBe('Work');
      expect(localStorage.getItem('calendarId')).toBe('cal-123');
      expect(localStorage.getItem('calendarName')).toBe('Work');
    });

    it('removes calendarName from localStorage when name is null', () => {
      localStorage.setItem('calendarName', 'Old');
      useCalendarStore.getState().setCalendar('cal-456', null);

      expect(useCalendarStore.getState().calendarName).toBeNull();
      expect(localStorage.getItem('calendarName')).toBeNull();
    });
  });

  describe('clearCalendar', () => {
    it('resets to defaults and clears localStorage', () => {
      useCalendarStore.getState().setCalendar('cal-123', 'Work');
      useCalendarStore.getState().clearCalendar();

      expect(useCalendarStore.getState().calendarId).toBe('primary');
      expect(useCalendarStore.getState().calendarName).toBeNull();
      expect(localStorage.getItem('calendarId')).toBeNull();
      expect(localStorage.getItem('calendarName')).toBeNull();
    });
  });
});
