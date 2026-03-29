import { google } from 'googleapis';
import type { Config } from '../../env-schema';
import { GoogleCalendarService } from './service';

export type CalendarServiceFactory = (
  accessToken: string,
  refreshToken: string,
  calendarId?: string,
) => GoogleCalendarService;

export function createGoogleCalendarService(
  accessToken: string,
  refreshToken: string,
  config: Pick<Config, 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET'>,
  onTokenRefresh?: (tokens: { accessToken: string; refreshToken?: string }) => void,
  calendarId = 'primary',
): GoogleCalendarService {
  const auth = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

  if (onTokenRefresh) {
    auth.on('tokens', (tokens) => {
      if (tokens.access_token) {
        onTokenRefresh({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? undefined,
        });
      }
    });
  }

  return new GoogleCalendarService(google.calendar({ version: 'v3', auth }), calendarId);
}
