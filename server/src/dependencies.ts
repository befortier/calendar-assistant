import Database from 'better-sqlite3';
import path from 'path';
import { Config } from './env-schema';
import { EncryptionManager } from './crypto';
import { DatabaseClient } from './db/client';
import { MigrationManager } from './db/migrate';

export class Dependencies {
  readonly encryption: EncryptionManager;
  readonly migrations: MigrationManager;
  readonly client: DatabaseClient;

  constructor(config: Config) {
    const db = new Database(path.join(__dirname, '../data/calendar.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    this.encryption = new EncryptionManager(config.TOKEN_ENCRYPTION_KEY);
    this.migrations = new MigrationManager(db);
    this.client = new DatabaseClient(db, this.encryption);
  }
}
