import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockAuth, MockOAuth2 } = vi.hoisted(() => {
  const mockAuth = {
    setCredentials: vi.fn(),
    on: vi.fn(),
  };
  const MockOAuth2 = vi.fn().mockReturnValue(mockAuth);
  return { mockAuth, MockOAuth2 };
});

vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: MockOAuth2 },
    calendar: vi.fn().mockReturnValue({ events: { list: vi.fn() } }),
  },
}));

// Import AFTER vi.mock so the mock is in place
const { createGoogleCalendarService } = await import('./factory');

const CONFIG = { GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret' };

function getTokensHandler() {
  const call = mockAuth.on.mock.calls.find(([event]) => event === 'tokens');
  return call?.[1] as ((tokens: Record<string, unknown>) => void) | undefined;
}

describe('createGoogleCalendarService', () => {
  beforeEach(() => {
    MockOAuth2.mockClear();
    mockAuth.setCredentials.mockClear();
    mockAuth.on.mockClear();
  });

  it('initializes OAuth2Client with provided client id and secret', () => {
    createGoogleCalendarService('access-token', 'refresh-token', CONFIG);

    expect(MockOAuth2).toHaveBeenCalledWith('client-id', 'client-secret');
  });

  it('sets credentials with provided tokens', () => {
    createGoogleCalendarService('access-token', 'refresh-token', CONFIG);

    expect(mockAuth.setCredentials).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
  });

  it('calls onTokenRefresh with new tokens when tokens event fires with valid access_token', () => {
    const onTokenRefresh = vi.fn();
    createGoogleCalendarService('access-token', 'refresh-token', CONFIG, onTokenRefresh);

    const handler = getTokensHandler();
    handler!({ access_token: 'new-access', refresh_token: 'new-refresh' });

    expect(onTokenRefresh).toHaveBeenCalledWith({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
  });

  it('does not call onTokenRefresh when tokens event fires with null access_token', () => {
    const onTokenRefresh = vi.fn();
    createGoogleCalendarService('access-token', 'refresh-token', CONFIG, onTokenRefresh);

    const handler = getTokensHandler();
    handler!({ access_token: null });

    expect(onTokenRefresh).not.toHaveBeenCalled();
  });

  it('does not register tokens listener when onTokenRefresh is not provided', () => {
    createGoogleCalendarService('access-token', 'refresh-token', CONFIG);

    expect(mockAuth.on).not.toHaveBeenCalled();
  });

  it('passes undefined refreshToken when tokens event fires without a new refresh token', () => {
    const onTokenRefresh = vi.fn();
    createGoogleCalendarService('access-token', 'refresh-token', CONFIG, onTokenRefresh);

    const handler = getTokensHandler();
    handler!({ access_token: 'new-access', refresh_token: null });

    expect(onTokenRefresh).toHaveBeenCalledWith({
      accessToken: 'new-access',
      refreshToken: undefined,
    });
  });
});
