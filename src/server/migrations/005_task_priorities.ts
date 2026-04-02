import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

export const migration005: Migration = {
  version: 5,
  name: "005_task_priorities",
  up(db: Database): void {
    // Seed board-local priorities in the migration so older boards gain the same
    // built-in rows as newly created boards, while existing tasks stay unassigned.
    db.exec(`
CREATE TABLE task_priority (
  id        INTEGER PRIMARY KEY,
  board_id  INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  value     INTEGER NOT NULL,
  label     TEXT    NOT NULL,
  color     TEXT    NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  UNIQUE(board_id, value)
);

CREATE INDEX idx_task_priority_board ON task_priority(board_id);

ALTER TABLE task ADD COLUMN priority_id INTEGER REFERENCES task_priority(id);

INSERT INTO task_priority (board_id, value, label, color, is_system)
SELECT b.id, seed.value, seed.label, seed.color, 1
FROM board b
CROSS JOIN (
  SELECT 10 AS value, 'low' AS label, '#94a3b8' AS color
  UNION ALL
  SELECT 20, 'medium', '#3b82f6'
  UNION ALL
  SELECT 30, 'high', '#f97316'
  UNION ALL
  SELECT 40, 'critical', '#ef4444'
) AS seed;
`);
  },
};
