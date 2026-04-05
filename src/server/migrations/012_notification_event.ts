import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

export const migration012: Migration = {
  version: 12,
  name: "012_notification_event",
  up(db: Database): void {
    db.exec(`
CREATE TABLE notification_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  board_id INTEGER,
  list_id INTEGER,
  task_id INTEGER,
  entity_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  client_id TEXT,
  client_name TEXT,
  client_instance_id TEXT,
  message TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX idx_notification_event_board_id ON notification_event(board_id);
CREATE INDEX idx_notification_event_created_at ON notification_event(created_at);
`);
  },
};
