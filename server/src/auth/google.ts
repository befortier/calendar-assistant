import { google } from 'googleapis';
import type { GoogleTokenResult } from '../routes/auth';

export function makeGoogleTokenExchanger(clientId: string, clientSecret: string, redirectUri: string) {
  return async function exchangeCode(code: string): Promise<GoogleTokenResult> {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();

    if (!data.id || !data.email) {
      throw new Error('Google did not return user id or email');
    }

    return {
      googleId: data.id,
      email: data.email,
      accessToken: tokens.access_token ?? '',
      refreshToken: tokens.refresh_token ?? null,
    };
  };
}
