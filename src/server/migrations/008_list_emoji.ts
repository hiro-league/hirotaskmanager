import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

export const migration008: Migration = {
  version: 8,
  name: "008_list_emoji",
  up(db: Database): void {
    db.exec(`ALTER TABLE list ADD COLUMN emoji TEXT;`);
  },
};
