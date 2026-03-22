import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { UserRepository } from './user-repository';
import { EncryptionManager } from '../crypto';
import { MigrationManager } from './migrate';

const KEY = 'a'.repeat(64);

function makeClient() {
  const db = new Database(':memory:');
  new MigrationManager(db).migrate();
  const encryption = new EncryptionManager(KEY);
  return new UserRepository(db, encryption);
}

describe('UserRepository.upsertUser', () => {
  let client: UserRepository;

  beforeEach(() => {
    client = makeClient();
  });

  it('returns a string id on insert', () => {
    const id = client.upsertUser('google-1', 'a@example.com', 'access-token', 'refresh-token');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns same id on second call with same googleId', () => {
    const id1 = client.upsertUser('google-1', 'a@example.com', 'access-token', 'refresh-token');
    const id2 = client.upsertUser('google-1', 'a@example.com', 'access-token-new', 'refresh-token-new');
    expect(id2).toBe(id1);
  });

  it('returns different ids for different googleIds', () => {
    const id1 = client.upsertUser('google-1', 'a@example.com', 'access-token', null);
    const id2 = client.upsertUser('google-2', 'b@example.com', 'access-token', null);
    expect(id1).not.toBe(id2);
  });
});

describe('UserRepository.getUserById', () => {
  let client: UserRepository;

  beforeEach(() => {
    client = makeClient();
  });

  it('returns null for unknown id', () => {
    expect(client.getUserById('nonexistent')).toBeNull();
  });

  it('returns user with decrypted tokens after upsert', () => {
    const id = client.upsertUser('google-1', 'a@example.com', 'my-access-token', 'my-refresh-token');
    const user = client.getUserById(id);
    expect(user).not.toBeNull();
    expect(user!.id).toBe(id);
    expect(user!.googleId).toBe('google-1');
    expect(user!.email).toBe('a@example.com');
    expect(user!.accessToken).toBe('my-access-token');
    expect(user!.refreshToken).toBe('my-refresh-token');
  });

  it('reflects updated tokens after second upsert', () => {
    const id = client.upsertUser('google-1', 'a@example.com', 'old-access', 'old-refresh');
    client.upsertUser('google-1', 'a@example.com', 'new-access', 'new-refresh');
    const user = client.getUserById(id);
    expect(user!.accessToken).toBe('new-access');
    expect(user!.refreshToken).toBe('new-refresh');
  });
});
