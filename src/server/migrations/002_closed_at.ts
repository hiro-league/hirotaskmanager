import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

export const migration002: Migration = {
  version: 2,
  name: "002_closed_at",
  up(db: Database): void {
    db.exec(`ALTER TABLE task ADD COLUMN closed_at TEXT`);
  },
};
