import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

export const migration009: Migration = {
  version: 9,
  name: "009_board_emoji",
  up(db: Database): void {
    db.exec(`ALTER TABLE board ADD COLUMN emoji TEXT;`);
  },
};
