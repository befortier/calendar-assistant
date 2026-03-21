import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export class EncryptionManager {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    const key = Buffer.from(hexKey, 'hex');
    if (key.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }
    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
