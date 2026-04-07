import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

/** Same-table soft delete columns for Trash (phase 1: schema + active-only reads). */
export const migration015: Migration = {
  version: 15,
  name: "015_trash_deleted_at",
  up(db: Database): void {
    db.exec(`
      ALTER TABLE board ADD COLUMN deleted_at TEXT;
      ALTER TABLE list ADD COLUMN deleted_at TEXT;
      ALTER TABLE task ADD COLUMN deleted_at TEXT;
    `);
    // Support trash tab listing and live queries filtering on deleted_at.
    db.exec(`
      CREATE INDEX idx_list_board_deleted ON list(board_id, deleted_at);
      CREATE INDEX idx_task_board_deleted ON task(board_id, deleted_at);
      CREATE INDEX idx_list_deleted_board ON list(deleted_at, board_id);
      CREATE INDEX idx_task_deleted_board ON task(deleted_at, board_id);
    `);
  },
};
