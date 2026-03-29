import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MigrationManager } from './migrate';
import { PreferencesRepository } from './preferences-repository';

function makeDb() {
  const db = new Database(':memory:');
  new MigrationManager(db).migrate();
  return db;
}

function makeUserInDb(db: ReturnType<typeof Database>) {
  db.prepare(
    "INSERT INTO users (id, google_id, email, encrypted_access_token) VALUES ('u1', 'g1', 'test@example.com', 'tok')",
  ).run();
}

describe('PreferencesRepository', () => {
  let repo: PreferencesRepository;
  let db: ReturnType<typeof Database>;

  beforeEach(() => {
    db = makeDb();
    makeUserInDb(db);
    repo = new PreferencesRepository(db);
  });

  it('returns empty string when no preferences saved', () => {
    expect(repo.getPreferences('u1')).toBe('');
  });

  it('saves and retrieves preferences', () => {
    repo.setPreferences('u1', 'I prefer mornings.');
    expect(repo.getPreferences('u1')).toBe('I prefer mornings.');
  });

  it('overwrites on second set', () => {
    repo.setPreferences('u1', 'first');
    repo.setPreferences('u1', 'second');
    expect(repo.getPreferences('u1')).toBe('second');
  });
});
