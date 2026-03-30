import { mkdirSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { runPendingMigrations } from "./migrations/runner";

/** Same rules as JSON storage — single place for DB path (see docs/sqlite_migration §5a). */
export function resolveDataDir(): string {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  if (process.env.NODE_ENV === "production") {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
    return path.join(home, ".taskmanager", "data");
  }
  return path.join(process.cwd(), "data");
}

export function getDbFilePath(): string {
  return path.join(resolveDataDir(), "taskmanager.db");
}

let dbInstance: Database | null = null;

export function getDb(): Database {
  if (!dbInstance) {
    mkdirSync(resolveDataDir(), { recursive: true });
    dbInstance = new Database(getDbFilePath(), { create: true });
    dbInstance.run("PRAGMA foreign_keys = ON");
  }
  return dbInstance;
}

export function withTransaction<T>(db: Database, fn: () => T): T {
  return db.transaction(fn)();
}

/** Applies numbered migrations until `_meta.schema_version` is current. */
export function runMigrations(): void {
  runPendingMigrations(getDb());
}
