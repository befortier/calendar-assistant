import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { Config } from './env-schema';
import { EncryptionManager } from './crypto';
import { UserRepository, type IUserRepository } from './db/user-repository';
import { PreferencesRepository, type IPreferencesRepository } from './db/preferences-repository';
import { MigrationManager } from './db/migrate';

export class Dependencies {
  readonly encryption: EncryptionManager;
  readonly migrations: MigrationManager;
  readonly client: IUserRepository;
  readonly preferences: IPreferencesRepository;

  constructor(config: Config) {
    const dbDir = path.join(__dirname, '../data');
    fs.mkdirSync(dbDir, { recursive: true });
    const db = new Database(path.join(dbDir, 'calendar.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    this.encryption = new EncryptionManager(config.TOKEN_ENCRYPTION_KEY);
    this.migrations = new MigrationManager(db);
    this.client = new UserRepository(db, this.encryption);
    this.preferences = new PreferencesRepository(db);
  }
}
