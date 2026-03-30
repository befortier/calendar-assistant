import type { Statement, Transaction } from 'better-sqlite3';

export interface IDatabase {
  exec(sql: string): this;
  prepare(sql: string): Statement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction<T extends (...args: any[]) => any>(fn: T): Transaction<T>;
}
