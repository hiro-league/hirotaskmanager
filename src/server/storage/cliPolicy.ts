import type { BoardCliPolicy, CliGlobalPolicy } from "../../shared/cliPolicy";
import { EMPTY_BOARD_CLI_POLICY, FULL_BOARD_CLI_POLICY } from "../../shared/cliPolicy";
import { getDb } from "../db";

/** Build policy from a JOIN row (nullable columns when LEFT JOIN misses). */
export function boardCliPolicyFromJoinColumns(row: {
  read_board: number | null;
  create_tasks: number | null;
  manage_cli_created_tasks: number | null;
  manage_any_tasks: number | null;
  create_lists: number | null;
  manage_cli_created_lists: number | null;
  manage_any_lists: number | null;
  manage_structure: number | null;
  delete_board: number | null;
  edit_board: number | null;
}): BoardCliPolicy | null {
  if (row.read_board == null) return null;
  return rowToPolicy({
    read_board: row.read_board,
    create_tasks: row.create_tasks ?? 0,
    manage_cli_created_tasks: row.manage_cli_created_tasks ?? 0,
    manage_any_tasks: row.manage_any_tasks ?? 0,
    create_lists: row.create_lists ?? 0,
    manage_cli_created_lists: row.manage_cli_created_lists ?? 0,
    manage_any_lists: row.manage_any_lists ?? 0,
    manage_structure: row.manage_structure ?? 0,
    delete_board: row.delete_board ?? 0,
    edit_board: row.edit_board ?? 0,
  });
}

function rowToPolicy(row: {
  read_board: number;
  create_tasks: number;
  manage_cli_created_tasks: number;
  manage_any_tasks: number;
  create_lists: number;
  manage_cli_created_lists: number;
  manage_any_lists: number;
  manage_structure: number;
  delete_board: number;
  edit_board: number;
}): BoardCliPolicy {
  return {
    readBoard: row.read_board !== 0,
    createTasks: row.create_tasks !== 0,
    manageCliCreatedTasks: row.manage_cli_created_tasks !== 0,
    manageAnyTasks: row.manage_any_tasks !== 0,
    createLists: row.create_lists !== 0,
    manageCliCreatedLists: row.manage_cli_created_lists !== 0,
    manageAnyLists: row.manage_any_lists !== 0,
    manageStructure: row.manage_structure !== 0,
    deleteBoard: row.delete_board !== 0,
    editBoard: row.edit_board !== 0,
  };
}

export function readCliGlobalPolicy(): CliGlobalPolicy {
  const db = getDb();
  const row = db
    .query("SELECT create_board FROM cli_global_policy WHERE id = 1")
    .get() as { create_board: number } | null;
  return { createBoard: row ? row.create_board !== 0 : false };
}

export function setCliGlobalCreateBoard(enabled: boolean): void {
  const db = getDb();
  db.run("INSERT OR REPLACE INTO cli_global_policy (id, create_board) VALUES (1, ?)", [
    enabled ? 1 : 0,
  ]);
}

export function readBoardCliPolicy(boardId: number): BoardCliPolicy | null {
  const db = getDb();
  const row = db
    .query(
      `SELECT read_board, create_tasks, manage_cli_created_tasks, manage_any_tasks,
              create_lists, manage_cli_created_lists, manage_any_lists, manage_structure,
              delete_board, edit_board
       FROM board_cli_policy WHERE board_id = ?`,
    )
    .get(boardId) as {
    read_board: number;
    create_tasks: number;
    manage_cli_created_tasks: number;
    manage_any_tasks: number;
    create_lists: number;
    manage_cli_created_lists: number;
    manage_any_lists: number;
    manage_structure: number;
    delete_board: number;
    edit_board: number;
  } | null;
  return row ? rowToPolicy(row) : null;
}

export function upsertBoardCliPolicy(boardId: number, policy: BoardCliPolicy): void {
  const db = getDb();
  db.run(
    `INSERT INTO board_cli_policy (
       board_id, read_board, create_tasks, manage_cli_created_tasks, manage_any_tasks,
       create_lists, manage_cli_created_lists, manage_any_lists, manage_structure,
       delete_board, edit_board
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(board_id) DO UPDATE SET
       read_board = excluded.read_board,
       create_tasks = excluded.create_tasks,
       manage_cli_created_tasks = excluded.manage_cli_created_tasks,
       manage_any_tasks = excluded.manage_any_tasks,
       create_lists = excluded.create_lists,
       manage_cli_created_lists = excluded.manage_cli_created_lists,
       manage_any_lists = excluded.manage_any_lists,
       manage_structure = excluded.manage_structure,
       delete_board = excluded.delete_board,
       edit_board = excluded.edit_board`,
    [
      boardId,
      policy.readBoard ? 1 : 0,
      policy.createTasks ? 1 : 0,
      policy.manageCliCreatedTasks ? 1 : 0,
      policy.manageAnyTasks ? 1 : 0,
      policy.createLists ? 1 : 0,
      policy.manageCliCreatedLists ? 1 : 0,
      policy.manageAnyLists ? 1 : 0,
      policy.manageStructure ? 1 : 0,
      policy.deleteBoard ? 1 : 0,
      policy.editBoard ? 1 : 0,
    ],
  );
}

/** New board from web: CLI defaults to locked down (same as legacy `none`). */
export function insertDefaultBoardCliPolicy(boardId: number): void {
  upsertBoardCliPolicy(boardId, { ...EMPTY_BOARD_CLI_POLICY });
}

/** CLI-created board: full CLI access without opening the web app (Phase 2). */
export function insertFullBoardCliPolicy(boardId: number): void {
  upsertBoardCliPolicy(boardId, { ...FULL_BOARD_CLI_POLICY });
}
