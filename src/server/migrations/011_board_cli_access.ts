import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

export const migration011: Migration = {
  version: 11,
  name: "011_board_cli_access",
  up(db: Database): void {
    db.exec(`
ALTER TABLE board ADD COLUMN cli_access TEXT NOT NULL DEFAULT 'none';
ALTER TABLE board ADD COLUMN description TEXT NOT NULL DEFAULT '';
`);
  },
};
