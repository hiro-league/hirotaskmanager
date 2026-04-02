import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

export const migration003: Migration = {
  version: 3,
  name: "003_task_search_fts5",
  up(db: Database): void {
    // Triggers keep FTS rows aligned with `task` on INSERT/UPDATE/DELETE, including CASCADE
    // deletes when a board or list is removed (FK cascades emit DELETE on each task row).
    db.exec(`
CREATE VIRTUAL TABLE task_search USING fts5(
  task_id UNINDEXED,
  board_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

INSERT INTO task_search (task_id, board_id, title, body)
SELECT id, board_id, title, body FROM task;

CREATE TRIGGER task_ai_fts5 AFTER INSERT ON task BEGIN
  INSERT INTO task_search (task_id, board_id, title, body)
  VALUES (NEW.id, NEW.board_id, NEW.title, NEW.body);
END;

CREATE TRIGGER task_au_fts5 AFTER UPDATE OF title, body, board_id ON task BEGIN
  DELETE FROM task_search WHERE task_id = OLD.id;
  INSERT INTO task_search (task_id, board_id, title, body)
  VALUES (NEW.id, NEW.board_id, NEW.title, NEW.body);
END;

CREATE TRIGGER task_ad_fts5 AFTER DELETE ON task BEGIN
  DELETE FROM task_search WHERE task_id = OLD.id;
END;
`);
  },
};
