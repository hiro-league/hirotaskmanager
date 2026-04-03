import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

export const migration010: Migration = {
  version: 10,
  name: "010_celebration_sounds_muted",
  up(db: Database): void {
    db.exec(`
ALTER TABLE board_view_prefs ADD COLUMN celebration_sounds_muted INTEGER NOT NULL DEFAULT 0;
`);
  },
};
