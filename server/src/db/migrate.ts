import fs from 'fs';
import path from 'path';
import { DatabaseClient } from './client';

export function runMigrations(client: DatabaseClient): void {
  client.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY)`);

  const applied = new Set(
    (client.db.prepare('SELECT filename FROM schema_migrations').all() as { filename: string }[])
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

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    client.db.exec(sql);
    client.db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
    console.log(`Migration applied: ${file}`);
  }
}
