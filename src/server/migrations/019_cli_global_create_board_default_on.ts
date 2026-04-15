import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

/**
 * Default global CLI `create_board` is now on (migration 013 originally seeded off).
 * Updates existing databases that already applied the old seed.
 */
export const migration019: Migration = {
  version: 19,
  name: "019_cli_global_create_board_default_on",
  up(db: Database): void {
    db.run("UPDATE cli_global_policy SET create_board = 1 WHERE id = 1");
  },
};
