import { describe, it, expect, beforeEach } from 'vitest';
import { EncryptionManager } from '../crypto';
import { DatabaseClient } from './client';
import { runMigrations } from './migrate';

const TEST_KEY = 'a'.repeat(64);

describe('runMigrations', () => {
  let client: DatabaseClient;

  beforeEach(() => {
    const encryption = new EncryptionManager(TEST_KEY);
    client = new DatabaseClient(encryption, ':memory:');
  });

  it('creates the users table', () => {
    runMigrations(client);
    const table = client.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    expect(table).toBeDefined();
  });

  it('creates the skills table', () => {
    runMigrations(client);
    const table = client.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='skills'").get();
    expect(table).toBeDefined();
  });

  it('users table has expected columns', () => {
    runMigrations(client);
    const columns = client.db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    const names = columns.map(c => c.name);
    expect(names).toEqual(expect.arrayContaining([
      'id', 'google_id', 'email',
      'encrypted_access_token', 'encrypted_refresh_token',
      'created_at', 'updated_at',
    ]));
  });

  it('is idempotent — running twice does not throw', () => {
    expect(() => {
      runMigrations(client);
      runMigrations(client);
    }).not.toThrow();
  });
});
