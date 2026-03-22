import { google } from 'googleapis';
import type { GoogleTokenResult } from '../routes/auth';

export interface IOAuth2Client {
  getToken(code: string): Promise<{ tokens: { access_token?: string | null; refresh_token?: string | null } }>;
  getUserInfo(tokens: { access_token?: string | null; refresh_token?: string | null }): Promise<{ id?: string | null; email?: string | null }>;
}

export interface IGoogleAuthFactory {
  createClient(clientId: string, clientSecret: string, redirectUri: string): IOAuth2Client;
}

interface GoogleTokenExchangerConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class GoogleTokenExchanger {
  constructor(
    private readonly config: GoogleTokenExchangerConfig,
    private readonly authFactory: IGoogleAuthFactory,
  ) {}

  async exchangeCode(code: string): Promise<GoogleTokenResult> {
    const client = this.authFactory.createClient(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUri,
    );

    const { tokens } = await client.getToken(code);
    if (!tokens.access_token) {
      throw new Error('Google did not return required user data');
    }

    const userInfo = await client.getUserInfo(tokens);
    if (!userInfo.id || !userInfo.email) {
      throw new Error('Google did not return required user data');
    }

    return {
      googleId: userInfo.id,
      email: userInfo.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
    };
  }
}

export const realGoogleAuthFactory: IGoogleAuthFactory = {
  createClient(clientId, clientSecret, redirectUri): IOAuth2Client {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    return {
      getToken: (code) => oauth2Client.getToken(code),
      async getUserInfo(tokens) {
        oauth2Client.setCredentials(tokens);
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data } = await oauth2.userinfo.get();
        return { id: data.id, email: data.email };
      },
    };
  },
};
