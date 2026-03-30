import type { Database } from "bun:sqlite";
import { migrations } from "./registry";

function tableExists(db: Database, name: string): boolean {
  const row = db
    .query(
      "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(name);
  return row != null;
}

function getSchemaVersion(db: Database): number {
  if (!tableExists(db, "_meta")) return 0;
  const row = db
    .query("SELECT value FROM _meta WHERE key = 'schema_version'")
    .get();
  if (row == null || typeof row !== "object" || !("value" in row)) return 0;
  const n = parseInt(String((row as { value: unknown }).value), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Runs each migration with `version` greater than the stored schema version,
 * in order. Updates `_meta.schema_version` after each migration succeeds.
 */
export function runPendingMigrations(db: Database): void {
  const current = getSchemaVersion(db);
  const pending = migrations.filter((m) => m.version > current);
  pending.sort((a, b) => a.version - b.version);

  for (const m of pending) {
    db.transaction(() => {
      m.up(db);
      db.run(
        "INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', ?)",
        [String(m.version)],
      );
    })();
  }
}
