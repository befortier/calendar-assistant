import { describe, it, expect } from 'vitest';
import { envSchema as schema } from './env-schema';

const VALID_ENV = {
  TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
  JWT_SECRET:           'secret',
  GOOGLE_CLIENT_ID:     'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  ANTHROPIC_API_KEY:    'api-key',
};

describe('env schema', () => {
  it('accepts a valid environment', () => {
    expect(() => schema.parse(VALID_ENV)).not.toThrow();
  });

  it('applies defaults for PORT and ALLOWED_ORIGIN', () => {
    const result = schema.parse(VALID_ENV);
    expect(result.PORT).toBe('3001');
    expect(result.ALLOWED_ORIGIN).toBe('http://localhost:5173');
  });

  it('rejects TOKEN_ENCRYPTION_KEY shorter than 64 chars', () => {
    expect(schema.safeParse({ ...VALID_ENV, TOKEN_ENCRYPTION_KEY: 'tooshort' }).success).toBe(false);
  });

  it('rejects TOKEN_ENCRYPTION_KEY longer than 64 chars', () => {
    expect(schema.safeParse({ ...VALID_ENV, TOKEN_ENCRYPTION_KEY: 'a'.repeat(65) }).success).toBe(false);
  });

  it('rejects TOKEN_ENCRYPTION_KEY with non-hex characters', () => {
    expect(schema.safeParse({ ...VALID_ENV, TOKEN_ENCRYPTION_KEY: 'z'.repeat(64) }).success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const { JWT_SECRET: _, ...withoutJwt } = VALID_ENV;
    expect(schema.safeParse(withoutJwt).success).toBe(false);
  });

  it('allows custom PORT and ALLOWED_ORIGIN', () => {
    const result = schema.parse({ ...VALID_ENV, PORT: '8080', ALLOWED_ORIGIN: 'https://app.example.com' });
    expect(result.PORT).toBe('8080');
    expect(result.ALLOWED_ORIGIN).toBe('https://app.example.com');
  });
});
