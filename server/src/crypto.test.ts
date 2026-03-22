import { describe, it, expect } from 'vitest';
import { EncryptionManager } from './crypto';

const TEST_KEY = 'a'.repeat(64); // valid 32-byte hex key for tests

describe('EncryptionManager', () => {
  const mgr = new EncryptionManager(TEST_KEY);

  it('round-trips a string', () => {
    const original = 'ya29.some-google-access-token';
    expect(mgr.decrypt(mgr.encrypt(original))).toBe(original);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const token = 'ya29.token';
    expect(mgr.encrypt(token)).not.toBe(mgr.encrypt(token));
  });

  it('ciphertext does not contain plaintext', () => {
    expect(mgr.encrypt('ya29.token')).not.toContain('ya29.token');
  });

  it('throws on invalid key length', () => {
    expect(() => new EncryptionManager('tooshort')).toThrow('TOKEN_ENCRYPTION_KEY');
  });
});
