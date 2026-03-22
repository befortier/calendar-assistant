import { google } from 'googleapis';
import type { GoogleTokenResult } from '../routes/auth';

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

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

    let tokens: { access_token?: string | null; refresh_token?: string | null };
    try {
      ({ tokens } = await client.getToken(code));
    } catch (err) {
      throw new GoogleAuthError(err instanceof Error ? err.message : 'Google rejected the authorization code');
    }
    if (!tokens.access_token) {
      throw new GoogleAuthError('Google did not return an access token');
    }

    let userInfo: { id?: string | null; email?: string | null };
    try {
      userInfo = await client.getUserInfo(tokens);
    } catch (err) {
      throw new GoogleAuthError(err instanceof Error ? err.message : 'Failed to fetch Google user info');
    }
    if (!userInfo.id || !userInfo.email) {
      throw new GoogleAuthError('Google did not return required user data');
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
