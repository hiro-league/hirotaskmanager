import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

/**
 * Add builtin `none` (value 0) for boards created before 005 seeded it, and assign
 * every task without `priority_id` to that row so priorities are always explicit.
 */
export const migration017: Migration = {
  version: 17,
  name: "017_task_priority_none_default",
  up(db: Database): void {
    db.exec(`
INSERT INTO task_priority (board_id, value, label, color, is_system)
SELECT b.id, 0, 'none', '#ffffff', 1
FROM board b
WHERE NOT EXISTS (
  SELECT 1 FROM task_priority tp WHERE tp.board_id = b.id AND tp.value = 0
);

UPDATE task
SET priority_id = (
  SELECT tp.id FROM task_priority tp
  WHERE tp.board_id = task.board_id AND tp.value = 0
  LIMIT 1
)
WHERE priority_id IS NULL;
`);
  },
};
