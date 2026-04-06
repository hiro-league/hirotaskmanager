import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

/** Legacy `board.cli_access` removed; `board_cli_policy` is the only source of truth. */
export const migration014: Migration = {
  version: 14,
  name: "014_drop_board_cli_access",
  up(db: Database): void {
    db.exec(`ALTER TABLE board DROP COLUMN cli_access;`);
  },
};
