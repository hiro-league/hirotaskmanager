import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

/** Board-scoped releases, optional task.release_id, default + auto-assign flags on board. */
export const migration018: Migration = {
  version: 18,
  name: "018_board_releases",
  up(db: Database): void {
    db.exec(`
      CREATE TABLE board_release (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id   INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE,
        name       TEXT    NOT NULL,
        color      TEXT,
        release_date TEXT,
        created_at TEXT    NOT NULL,
        UNIQUE(board_id, name)
      );
      CREATE INDEX idx_board_release_board ON board_release(board_id);
    `);
    db.exec(`
      ALTER TABLE task ADD COLUMN release_id INTEGER;
    `);
    db.exec(`
      CREATE INDEX idx_task_release ON task(release_id);
    `);
    db.exec(`
      ALTER TABLE board ADD COLUMN default_release_id INTEGER;
      ALTER TABLE board ADD COLUMN auto_assign_release_ui INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE board ADD COLUMN auto_assign_release_cli INTEGER NOT NULL DEFAULT 0;
    `);
  },
};
