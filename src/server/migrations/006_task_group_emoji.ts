import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

export const migration006: Migration = {
  version: 6,
  name: "006_task_group_emoji",
  up(db: Database): void {
    db.exec(`ALTER TABLE task_group ADD COLUMN emoji TEXT;`);
  },
};
