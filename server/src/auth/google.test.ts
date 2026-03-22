import { describe, it, expect, vi } from 'vitest';
import { GoogleTokenExchanger, GoogleAuthError } from './google';
import type { IGoogleAuthFactory } from './google';

const CONFIG = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'http://localhost:5173/auth/callback',
};

function makeFactory(overrides?: Partial<{ getToken: ReturnType<typeof vi.fn>; getUserInfo: ReturnType<typeof vi.fn> }>): IGoogleAuthFactory {
  const getToken = overrides?.getToken ?? vi.fn().mockResolvedValue({
    tokens: { access_token: 'access-xyz', refresh_token: 'refresh-xyz' },
  });
  const getUserInfo = overrides?.getUserInfo ?? vi.fn().mockResolvedValue({
    id: 'google-123',
    email: 'user@example.com',
  });
  return {
    createClient: vi.fn().mockReturnValue({ getToken, getUserInfo }),
  };
}

describe('GoogleTokenExchanger.exchangeCode', () => {
  it('returns GoogleTokenResult with googleId, email, and tokens', async () => {
    const factory = makeFactory();
    const exchanger = new GoogleTokenExchanger(CONFIG, factory);

    const result = await exchanger.exchangeCode('auth-code');

    expect(result.googleId).toBe('google-123');
    expect(result.email).toBe('user@example.com');
    expect(result.accessToken).toBe('access-xyz');
    expect(result.refreshToken).toBe('refresh-xyz');
  });

  it('creates the OAuth2 client with correct config', async () => {
    const factory = makeFactory();
    const exchanger = new GoogleTokenExchanger(CONFIG, factory);

    await exchanger.exchangeCode('auth-code');

    expect(factory.createClient).toHaveBeenCalledWith('client-id', 'client-secret', 'http://localhost:5173/auth/callback');
  });

  it('passes the code to getToken', async () => {
    const getToken = vi.fn().mockResolvedValue({ tokens: { access_token: 'a', refresh_token: null } });
    const factory = makeFactory({ getToken });
    const exchanger = new GoogleTokenExchanger(CONFIG, factory);

    await exchanger.exchangeCode('my-code');

    expect(getToken).toHaveBeenCalledWith('my-code');
  });

  it('throws when Google does not return id or email', async () => {
    const factory = makeFactory({
      getUserInfo: vi.fn().mockResolvedValue({ id: null, email: null }),
    });
    const exchanger = new GoogleTokenExchanger(CONFIG, factory);

    await expect(exchanger.exchangeCode('code')).rejects.toThrow();
  });

  it('throws when Google does not return access_token', async () => {
    const factory = makeFactory({
      getToken: vi.fn().mockResolvedValue({ tokens: { access_token: null, refresh_token: null } }),
    });
    const exchanger = new GoogleTokenExchanger(CONFIG, factory);

    await expect(exchanger.exchangeCode('code')).rejects.toThrow('Google did not return an access token');
    await expect(exchanger.exchangeCode('code')).rejects.toBeInstanceOf(GoogleAuthError);
  });

  it('handles null refreshToken gracefully', async () => {
    const factory = makeFactory({
      getToken: vi.fn().mockResolvedValue({ tokens: { access_token: 'a', refresh_token: null } }),
    });
    const exchanger = new GoogleTokenExchanger(CONFIG, factory);

    const result = await exchanger.exchangeCode('code');

    expect(result.refreshToken).toBeNull();
  });
});
