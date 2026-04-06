import { mkdirSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { resolveDataDir as resolveRuntimeDataDir } from "../shared/runtimeConfig";
import { runPendingMigrations } from "./migrations/runner";

/** Use the active runtime profile so installed and dev data stay isolated. */
export function resolveDataDir(): string {
  return resolveRuntimeDataDir();
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
