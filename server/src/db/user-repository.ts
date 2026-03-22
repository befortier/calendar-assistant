import crypto from 'crypto';
import { IDatabase } from './types';
import { EncryptionManager } from '../crypto';

export interface User {
  id: string;
  googleId: string;
  email: string;
  accessToken: string;
  refreshToken: string | null;
}

export interface IUserRepository {
  upsertUser(googleId: string, email: string, accessToken: string, refreshToken: string | null): string;
  getUserById(id: string): User | null;
}

interface UserRow {
  id: string;
  google_id: string;
  email: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string | null;
}

export class UserRepository implements IUserRepository {
  private readonly db: IDatabase;
  private readonly encryption: EncryptionManager;

  constructor(db: IDatabase, encryption: EncryptionManager) {
    this.db = db;
    this.encryption = encryption;
  }

  upsertUser(googleId: string, email: string, accessToken: string, refreshToken: string | null): string {
    const existing = this.db.prepare('SELECT id FROM users WHERE google_id = ?').get(googleId) as { id: string } | undefined;

    const encryptedAccess = this.encryption.encrypt(accessToken);
    const encryptedRefresh = refreshToken !== null ? this.encryption.encrypt(refreshToken) : null;

    if (existing) {
      this.db.prepare(
        "UPDATE users SET encrypted_access_token = ?, encrypted_refresh_token = ?, updated_at = datetime('now') WHERE google_id = ?"
      ).run(encryptedAccess, encryptedRefresh, googleId);
      return existing.id;
    }

    const id = crypto.randomUUID();
    this.db.prepare(
      'INSERT INTO users (id, google_id, email, encrypted_access_token, encrypted_refresh_token) VALUES (?, ?, ?, ?, ?)'
    ).run(id, googleId, email, encryptedAccess, encryptedRefresh);
    return id;
  }

  getUserById(id: string): User | null {
    const row = this.db.prepare(
      'SELECT id, google_id, email, encrypted_access_token, encrypted_refresh_token FROM users WHERE id = ?'
    ).get(id) as UserRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      googleId: row.google_id,
      email: row.email,
      accessToken: this.encryption.decrypt(row.encrypted_access_token),
      refreshToken: row.encrypted_refresh_token !== null ? this.encryption.decrypt(row.encrypted_refresh_token) : null,
    };
  }
}
