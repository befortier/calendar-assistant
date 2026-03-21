import fs from 'fs';
import path from 'path';
import { IDatabase } from './types';

export class MigrationManager {
  private readonly db: IDatabase;

  constructor(db: IDatabase) {
    this.db = db;
  }

  migrate(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY)`);

    const applied = new Set(
      (this.db.prepare('SELECT filename FROM schema_migrations').all() as { filename: string }[])
        .map(r => r.filename)
    );

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .filter(f => {
        if (!/^\d{3}_\w+\.sql$/.test(f)) throw new Error(`Invalid migration filename: ${f}`);
        return true;
      })
      .sort();

    const applyMigration = this.db.transaction((file: string, sql: string) => {
      this.db.exec(sql);
      this.db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
    });

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      applyMigration(file, sql);
      console.log(`Migration applied: ${file}`);
    }
  }
}
