import type { IDatabase } from './types';

export interface IPreferencesRepository {
  getPreferences(userId: string): string;
  setPreferences(userId: string, content: string): void;
}

interface PreferencesRow {
  content: string;
}

export class PreferencesRepository implements IPreferencesRepository {
  constructor(private readonly db: IDatabase) {}

  getPreferences(userId: string): string {
    const row = this.db.prepare(
      'SELECT content FROM skills WHERE user_id = ?',
    ).get(userId) as PreferencesRow | undefined;
    return row?.content ?? '';
  }

  setPreferences(userId: string, content: string): void {
    this.db.prepare(`
      INSERT INTO skills (user_id, content, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        content = excluded.content,
        updated_at = datetime('now')
    `).run(userId, content);
  }
}
