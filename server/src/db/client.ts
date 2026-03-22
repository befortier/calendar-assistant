import { IDatabase } from './types';
import { EncryptionManager } from '../crypto';

// TODO: add token storage methods (storeUserTokens, getUserTokens) in the auth PR
export class DatabaseClient {
  private readonly db: IDatabase;
  private readonly encryption: EncryptionManager;

  constructor(db: IDatabase, encryption: EncryptionManager) {
    this.db = db;
    this.encryption = encryption;
  }
}
