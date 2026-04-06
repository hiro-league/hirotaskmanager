import type { Database } from "bun:sqlite";
import type { Migration } from "./types";

/** Phase 2 auth: granular CLI policy per board, global create_board, creator provenance. */
export const migration013: Migration = {
  version: 13,
  name: "013_cli_policy_and_provenance",
  up(db: Database): void {
    db.exec(`
ALTER TABLE board ADD COLUMN created_by_principal TEXT NOT NULL DEFAULT 'web';
ALTER TABLE board ADD COLUMN created_by_label TEXT;

ALTER TABLE list ADD COLUMN created_by_principal TEXT NOT NULL DEFAULT 'web';
ALTER TABLE list ADD COLUMN created_by_label TEXT;

ALTER TABLE task ADD COLUMN created_by_principal TEXT NOT NULL DEFAULT 'web';
ALTER TABLE task ADD COLUMN created_by_label TEXT;

CREATE TABLE cli_global_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  create_board INTEGER NOT NULL DEFAULT 0
);

INSERT INTO cli_global_policy (id, create_board) VALUES (1, 0);

CREATE TABLE board_cli_policy (
  board_id INTEGER PRIMARY KEY REFERENCES board(id) ON DELETE CASCADE,
  read_board INTEGER NOT NULL DEFAULT 0,
  create_tasks INTEGER NOT NULL DEFAULT 0,
  manage_cli_created_tasks INTEGER NOT NULL DEFAULT 0,
  manage_any_tasks INTEGER NOT NULL DEFAULT 0,
  create_lists INTEGER NOT NULL DEFAULT 0,
  manage_cli_created_lists INTEGER NOT NULL DEFAULT 0,
  manage_any_lists INTEGER NOT NULL DEFAULT 0,
  manage_structure INTEGER NOT NULL DEFAULT 0,
  delete_board INTEGER NOT NULL DEFAULT 0,
  edit_board INTEGER NOT NULL DEFAULT 0
);
`);

    const boards = db
      .query("SELECT id, cli_access FROM board")
      .all() as { id: number; cli_access: string | null }[];

    const insertPolicy = db.prepare(`
      INSERT INTO board_cli_policy (
        board_id, read_board, create_tasks, manage_cli_created_tasks, manage_any_tasks,
        create_lists, manage_cli_created_lists, manage_any_lists, manage_structure,
        delete_board, edit_board
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of boards) {
      const a = (row.cli_access ?? "none").trim();
      if (a === "read") {
        insertPolicy.run(row.id, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      } else if (a === "read_write") {
        insertPolicy.run(row.id, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
      } else {
        insertPolicy.run(row.id, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      }
    }
  },
};
