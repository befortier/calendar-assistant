// Barrel re-export — maintains the same public API as the original googleCalendar.ts
// so no import paths need to change except calendarSkill.ts (invertBusy → calendarAlgorithms).

export type {
  AttendeeInfo,
  EventReminder,
  CalendarEvent,
  CalendarInfo,
  FreeSlot,
  BusyBlock,
  CalendarAccessError,
  CalendarAccessStatus,
  CalendarFreeBusy,
  FreeBusyResult,
  CreateEventInput,
  UpdateEventInput,
  RecurrenceScope,
} from './types';

export { GoogleCalendarService } from './service';
export { createGoogleCalendarService, type CalendarServiceFactory } from './factory';
