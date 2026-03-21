import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { EncryptionManager } from '../crypto';

export class DatabaseClient {
  // Public for migrate.ts and test helpers. Prefer typed methods on this class
  // over direct db access when adding service-layer code.
  readonly db: Database.Database;
  private readonly encryption: EncryptionManager;

  constructor(encryption: EncryptionManager, dbPath: string) {
    this.encryption = encryption;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }
}
