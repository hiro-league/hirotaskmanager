import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

export const migration004: Migration = {
  version: 4,
  name: "004_task_search_extended",
  up(db: Database): void {
    // Phase 3: index list name, task group label, and status label alongside title/body.
    // Drop old FTS + task triggers, rebuild table with extra columns, then add task triggers
    // plus list / task_group / status triggers so label renames refresh FTS rows.
    db.exec(`
DROP TRIGGER IF EXISTS task_ai_fts5;
DROP TRIGGER IF EXISTS task_au_fts5;
DROP TRIGGER IF EXISTS task_ad_fts5;
DROP TABLE IF EXISTS task_search;

CREATE VIRTUAL TABLE task_search USING fts5(
  task_id UNINDEXED,
  board_id UNINDEXED,
  title,
  body,
  list_name,
  group_label,
  status_label,
  tokenize = 'unicode61 remove_diacritics 2'
);

INSERT INTO task_search (
  task_id, board_id, title, body, list_name, group_label, status_label
)
SELECT
  t.id,
  t.board_id,
  t.title,
  t.body,
  l.name,
  tg.label,
  s.label
FROM task t
JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
JOIN task_group tg ON tg.id = t.group_id AND tg.board_id = t.board_id
JOIN status s ON s.id = t.status_id;

CREATE TRIGGER task_ai_fts5 AFTER INSERT ON task BEGIN
  INSERT INTO task_search (
    task_id, board_id, title, body, list_name, group_label, status_label
  )
  SELECT
    NEW.id,
    NEW.board_id,
    NEW.title,
    NEW.body,
    l.name,
    tg.label,
    s.label
  FROM list l, task_group tg, status s
  WHERE l.id = NEW.list_id
    AND l.board_id = NEW.board_id
    AND tg.id = NEW.group_id
    AND tg.board_id = NEW.board_id
    AND s.id = NEW.status_id;
END;

CREATE TRIGGER task_au_fts5 AFTER UPDATE OF
  title, body, board_id, list_id, group_id, status_id
ON task BEGIN
  DELETE FROM task_search WHERE task_id = OLD.id;
  INSERT INTO task_search (
    task_id, board_id, title, body, list_name, group_label, status_label
  )
  SELECT
    NEW.id,
    NEW.board_id,
    NEW.title,
    NEW.body,
    l.name,
    tg.label,
    s.label
  FROM list l, task_group tg, status s
  WHERE l.id = NEW.list_id
    AND l.board_id = NEW.board_id
    AND tg.id = NEW.group_id
    AND tg.board_id = NEW.board_id
    AND s.id = NEW.status_id;
END;

CREATE TRIGGER task_ad_fts5 AFTER DELETE ON task BEGIN
  DELETE FROM task_search WHERE task_id = OLD.id;
END;

CREATE TRIGGER list_au_fts5 AFTER UPDATE OF name ON list
WHEN OLD.name IS NOT NEW.name
BEGIN
  DELETE FROM task_search WHERE task_id IN (
    SELECT id FROM task WHERE list_id = NEW.id
  );
  INSERT INTO task_search (
    task_id, board_id, title, body, list_name, group_label, status_label
  )
  SELECT
    t.id,
    t.board_id,
    t.title,
    t.body,
    NEW.name,
    tg.label,
    s.label
  FROM task t
  JOIN task_group tg ON tg.id = t.group_id AND tg.board_id = t.board_id
  JOIN status s ON s.id = t.status_id
  WHERE t.list_id = NEW.id;
END;

CREATE TRIGGER tg_au_fts5 AFTER UPDATE OF label ON task_group
WHEN OLD.label IS NOT NEW.label
BEGIN
  DELETE FROM task_search WHERE task_id IN (
    SELECT id FROM task WHERE group_id = NEW.id
  );
  INSERT INTO task_search (
    task_id, board_id, title, body, list_name, group_label, status_label
  )
  SELECT
    t.id,
    t.board_id,
    t.title,
    t.body,
    l.name,
    NEW.label,
    s.label
  FROM task t
  JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
  JOIN status s ON s.id = t.status_id
  WHERE t.group_id = NEW.id;
END;

CREATE TRIGGER status_au_fts5 AFTER UPDATE OF label ON status
WHEN OLD.label IS NOT NEW.label
BEGIN
  DELETE FROM task_search WHERE task_id IN (
    SELECT id FROM task WHERE status_id = NEW.id
  );
  INSERT INTO task_search (
    task_id, board_id, title, body, list_name, group_label, status_label
  )
  SELECT
    t.id,
    t.board_id,
    t.title,
    t.body,
    l.name,
    tg.label,
    NEW.label
  FROM task t
  JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
  JOIN task_group tg ON tg.id = t.group_id AND tg.board_id = t.board_id
  WHERE t.status_id = NEW.id;
END;
`);
  },
};
