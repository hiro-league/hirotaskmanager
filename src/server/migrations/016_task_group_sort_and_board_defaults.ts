import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

/** Per-board task group ordering and explicit default/fallback group pointers on `board`. */
export const migration016: Migration = {
  version: 16,
  name: "016_task_group_sort_and_board_defaults",
  up(db: Database): void {
    db.exec(`
      ALTER TABLE task_group ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
    `);
    // 0,1,2,... within each board by existing id order (stable, no window functions required).
    db.exec(`
      UPDATE task_group SET sort_order = (
        SELECT COUNT(*) - 1 FROM task_group t2
        WHERE t2.board_id = task_group.board_id AND t2.id <= task_group.id
      );
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_group_board_sort ON task_group(board_id, sort_order);
    `);

    db.exec(`
      ALTER TABLE board ADD COLUMN default_task_group_id INTEGER;
      ALTER TABLE board ADD COLUMN deleted_group_fallback_id INTEGER;
    `);

    db.exec(`
      UPDATE board SET
        default_task_group_id = (
          SELECT tg.id FROM task_group tg WHERE tg.board_id = board.id ORDER BY tg.sort_order, tg.id LIMIT 1
        ),
        deleted_group_fallback_id = (
          SELECT tg.id FROM task_group tg WHERE tg.board_id = board.id ORDER BY tg.sort_order, tg.id LIMIT 1
        )
      WHERE EXISTS (SELECT 1 FROM task_group tg WHERE tg.board_id = board.id);
    `);
  },
};
