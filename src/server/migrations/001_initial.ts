import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

export const migration001: Migration = {
  version: 1,
  name: "001_initial",
  up(db: Database): void {
    db.exec(`
CREATE TABLE status (
  id         TEXT    PRIMARY KEY,
  label      TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_closed  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE board (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  slug       TEXT    NOT NULL UNIQUE,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

CREATE TABLE task_group (
  id       INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  label    TEXT    NOT NULL
);

CREATE INDEX idx_task_group_board ON task_group(board_id);

CREATE TABLE list (
  id         INTEGER PRIMARY KEY,
  board_id   INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  color      TEXT
);

CREATE INDEX idx_list_board ON list(board_id);

CREATE TABLE task (
  id         INTEGER PRIMARY KEY,
  list_id    INTEGER NOT NULL REFERENCES list(id) ON DELETE CASCADE,
  group_id   INTEGER NOT NULL REFERENCES task_group(id),
  board_id   INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  status_id  TEXT    NOT NULL REFERENCES status(id),
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  color      TEXT,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

CREATE INDEX idx_task_list   ON task(list_id);
CREATE INDEX idx_task_board  ON task(board_id);
CREATE INDEX idx_task_status ON task(status_id);
CREATE INDEX idx_task_group  ON task(group_id);

CREATE TABLE board_view_prefs (
  board_id            INTEGER PRIMARY KEY REFERENCES board(id) ON DELETE CASCADE,
  visible_statuses    TEXT,
  status_band_weights TEXT,
  board_layout        TEXT DEFAULT 'stacked',
  board_color         TEXT,
  background_image    TEXT,
  show_counts         INTEGER DEFAULT 1
);

CREATE TABLE _meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

    db.exec(`
INSERT INTO status (id, label, sort_order, is_closed) VALUES
  ('open',        'Open',        0, 0),
  ('in-progress', 'In Progress', 1, 0),
  ('closed',      'Closed',      2, 1);
`);
  },
};
