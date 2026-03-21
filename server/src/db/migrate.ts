import fs from 'fs';
import path from 'path';
import { DatabaseClient } from './client';

export function runMigrations(client: DatabaseClient): void {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    client.db.exec(sql);
    console.log(`Migration applied: ${file}`);
  }
}
