import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MigrationManager } from './migrate';

describe('MigrationManager', () => {
  let db: Database.Database;
  let migrations: MigrationManager;

  beforeEach(() => {
    db = new Database(':memory:');
    migrations = new MigrationManager(db);
  });

  it('creates the users table', () => {
    migrations.migrate();
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    expect(table).toBeDefined();
  });

  it('creates the skills table', () => {
    migrations.migrate();
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='skills'").get();
    expect(table).toBeDefined();
  });

  it('users table has expected columns', () => {
    migrations.migrate();
    const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    const names = columns.map(c => c.name);
    expect(names).toEqual(expect.arrayContaining([
      'id', 'google_id', 'email',
      'encrypted_access_token', 'encrypted_refresh_token',
      'created_at', 'updated_at',
    ]));
  });

  it('is idempotent — running twice does not throw', () => {
    expect(() => {
      migrations.migrate();
      migrations.migrate();
    }).not.toThrow();
  });
});
