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
