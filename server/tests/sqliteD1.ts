// A D1-shaped database on node:sqlite (built into Node 24), for testing the
// account store without the Workers runtime. It exposes only what
// `SqlDatabase` has: no exec and no transactions, so the store can't come to
// rely on them. `batch` uses a transaction internally, as D1 does.

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { SqlDatabase, SqlStatement, SqlValue } from "../src/accountStore.ts";

export const MIGRATIONS_DIR = resolve(import.meta.dirname, "../migrations");

/** The migration files in the order wrangler applies them (by name). */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

class Statement implements SqlStatement {
  constructor(
    private stmt: StatementSync,
    private values: SqlValue[] = [],
  ) {}

  bind(...values: SqlValue[]): SqlStatement {
    return new Statement(this.stmt, values);
  }

  async first<T>(): Promise<T | null> {
    const row = this.stmt.get(...this.values);
    return row ? ({ ...row } as T) : null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.stmt.all(...this.values).map((row) => ({ ...row }) as T) };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    return this.runSync();
  }

  runSync(): { meta: { changes: number } } {
    return { meta: { changes: Number(this.stmt.run(...this.values).changes) } };
  }
}

/** A fresh in-memory database with every migration applied, in order. */
export function migratedDatabase(): SqlDatabase {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of migrationFiles()) sqlite.exec(readFileSync(resolve(MIGRATIONS_DIR, file), "utf8"));
  return {
    prepare: (query) => new Statement(sqlite.prepare(query)),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((s) => (s as Statement).runSync());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
