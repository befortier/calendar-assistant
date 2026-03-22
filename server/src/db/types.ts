import type { Statement } from 'better-sqlite3';

export interface IDatabase {
  exec(sql: string): this;
  prepare(sql: string): Statement;
  transaction<T extends (...args: unknown[]) => unknown>(fn: T): T;
}
