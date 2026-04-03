import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

export const migration007: Migration = {
  version: 7,
  name: "007_task_emoji",
  up(db: Database): void {
    db.exec(`ALTER TABLE task ADD COLUMN emoji TEXT;`);
  },
};
