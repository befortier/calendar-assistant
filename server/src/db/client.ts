import { IDatabase } from './types';
import { EncryptionManager } from '../crypto';

export class DatabaseClient {
  private readonly db: IDatabase;
  private readonly encryption: EncryptionManager;

  constructor(db: IDatabase, encryption: EncryptionManager) {
    this.db = db;
    this.encryption = encryption;
  }
}
