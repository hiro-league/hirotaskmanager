/**
 * One-off: copy `data/taskmanager.db` to `data/taskmanager_new.db` with dense integer IDs
 * starting at 1 (boards, lists, task groups, tasks, releases, priorities, etc.).
 * Run: `bun run scripts/compact-taskmanager-ids.ts` or `npm run db:compact-ids`.
 * Args: `[sourcePath]` (default `data/taskmanager.db`), `[destPath]` (default `data/taskmanager_new.db`).
 *
 * See conversation: refill ID space for dev DBs used in perf testing.
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { runPendingMigrations } from "../src/server/migrations/runner";

const scriptDir = import.meta.dir;
const repoRoot = path.join(scriptDir, "..");
const defaultDataDir = path.join(repoRoot, "data");
const defaultSource = path.join(defaultDataDir, "taskmanager.db");
const defaultDest = path.join(defaultDataDir, "taskmanager_new.db");

function getColumns(db: Database, table: string): string[] {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return rows.map((r) => r.name);
}

function pickRow(
  row: Record<string, unknown>,
  columns: string[],
): unknown[] {
  return columns.map((c) => row[c] ?? null);
}

function setSeq(
  db: Database,
  table: string,
): void {
  const max = db
    .query(`SELECT MAX(id) AS m FROM ${table}`)
    .get() as { m: number | null };
  const m = max?.m;
  if (m == null || m < 1) {
    return;
  }
  const existing = db
    .query(
      "SELECT 1 AS ok FROM sqlite_sequence WHERE name = ?",
    )
    .get(table);
  if (existing) {
    db.run("UPDATE sqlite_sequence SET seq = ? WHERE name = ?", [m, table]);
  } else {
    db.run("INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)", [
      table,
      m,
    ]);
  }
}

function main(): void {
  const sourcePath = process.argv[2] ?? defaultSource;
  const destPath = process.argv[3] ?? defaultDest;

  if (!existsSync(sourcePath)) {
    console.error(`Source database not found: ${sourcePath}`);
    process.exit(1);
  }

  mkdirSync(path.dirname(destPath), { recursive: true });
  if (existsSync(destPath)) {
    unlinkSync(destPath);
  }

  const src = new Database(sourcePath, { readonly: true });
  const dst = new Database(destPath, { create: true });
  try {
    dst.run("PRAGMA foreign_keys = OFF");
    runPendingMigrations(dst);
    // Migrations seed `status` and `cli_global_policy`; replace with source rows.
    dst.exec(`
      DELETE FROM task_search;
      DELETE FROM notification_event;
      DELETE FROM task;
      DELETE FROM board_view_prefs;
      DELETE FROM board_cli_policy;
      DELETE FROM board_release;
      DELETE FROM task_priority;
      DELETE FROM list;
      DELETE FROM task_group;
      DELETE FROM board;
      DELETE FROM status;
      DELETE FROM cli_global_policy;
    `);
    // Keep FKs off while bulk loading; triggers still run (FTS) for each inserted task row.
    // Reason: we temporarily violate logical order only where mitigated (board pointers nulled first).

    // --- Build ID maps from source (stable ordering) ---
    const boardOrder = src
      .query("SELECT id FROM board ORDER BY id")
      .all() as { id: number }[];
    const mapBoard = new Map<number, number>();
    for (let i = 0; i < boardOrder.length; i++) {
      mapBoard.set(boardOrder[i]!.id, i + 1);
    }

    let nextTg = 0;
    const mapTaskGroup = new Map<number, number>();
    const tgRows = src
      .query(
        "SELECT id FROM task_group ORDER BY board_id, sort_order, id",
      )
      .all() as { id: number }[];
    for (const r of tgRows) {
      nextTg += 1;
      mapTaskGroup.set(r.id, nextTg);
    }

    let nextList = 0;
    const mapList = new Map<number, number>();
    const listRows = src
      .query("SELECT id FROM list ORDER BY board_id, sort_order, id")
      .all() as { id: number }[];
    for (const r of listRows) {
      nextList += 1;
      mapList.set(r.id, nextList);
    }

    let nextPrio = 0;
    const mapPriority = new Map<number, number>();
    const prioRows = src
      .query(
        "SELECT id FROM task_priority ORDER BY board_id, value, id",
      )
      .all() as { id: number }[];
    for (const r of prioRows) {
      nextPrio += 1;
      mapPriority.set(r.id, nextPrio);
    }

    let nextRel = 0;
    const mapRelease = new Map<number, number>();
    const relRows = src
      .query("SELECT id FROM board_release ORDER BY board_id, id")
      .all() as { id: number }[];
    for (const r of relRows) {
      nextRel += 1;
      mapRelease.set(r.id, nextRel);
    }

    let nextTask = 0;
    const mapTask = new Map<number, number>();
    const taskRows = src
      .query("SELECT id FROM task ORDER BY board_id, list_id, id")
      .all() as { id: number }[];
    for (const r of taskRows) {
      nextTask += 1;
      mapTask.set(r.id, nextTask);
    }

    const tx = dst.transaction(() => {
    // status
    const statusCols = getColumns(src, "status");
    const allStatus = src
      .query(`SELECT ${statusCols.join(", ")} FROM status`)
      .all() as Record<string, unknown>[];
    if (allStatus.length > 0) {
      const ph = statusCols.map(() => "?").join(", ");
      const ins = dst.prepare(
        `INSERT INTO status (${statusCols.join(", ")}) VALUES (${ph})`,
      );
      for (const row of allStatus) {
        ins.run(...pickRow(row, statusCols));
      }
    }

    // cli_global_policy
    const cgpCols = getColumns(src, "cli_global_policy");
    const cgp = src
      .query(
        `SELECT ${cgpCols.join(", ")} FROM cli_global_policy`,
      )
      .get() as Record<string, unknown> | null;
    if (cgp) {
      const ph = cgpCols.map(() => "?").join(", ");
      dst.run(
        `INSERT INTO cli_global_policy (${cgpCols.join(
          ", ",
        )}) VALUES (${ph})`,
        pickRow(cgp, cgpCols),
      );
    }

    // board: clear FK-like pointers; fill after child tables
    const boardCols = getColumns(dst, "board");
    const boards = src
      .query(
        `SELECT ${boardCols.join(", ")} FROM board ORDER BY id`,
      )
      .all() as Record<string, unknown>[];
    const bInsert = dst.prepare(
      `INSERT INTO board (${boardCols.join(", ")}) VALUES (${boardCols
        .map(() => "?")
        .join(", ")})`,
    );
    for (const row of boards) {
      const oldId = row.id as number;
      const newId = mapBoard.get(oldId);
      if (newId == null) {
        throw new Error(`board id ${oldId} not in map`);
      }
      const out: unknown[] = [];
      for (const c of boardCols) {
        if (c === "id") {
          out.push(newId);
        } else if (c === "default_release_id") {
          out.push(null);
        } else if (c === "default_task_group_id") {
          out.push(null);
        } else if (c === "deleted_group_fallback_id") {
          out.push(null);
        } else {
          out.push(row[c] ?? null);
        }
      }
      bInsert.run(...out);
    }

    // task_group
    const tgCols = getColumns(dst, "task_group");
    const tgs = src
      .query(
        `SELECT ${tgCols.join(", ")} FROM task_group ORDER BY board_id, sort_order, id`,
      )
      .all() as Record<string, unknown>[];
    const tgIns = dst.prepare(
      `INSERT INTO task_group (${tgCols.join(", ")}) VALUES (${tgCols
        .map(() => "?")
        .join(", ")})`,
    );
    for (const row of tgs) {
      const newId = mapTaskGroup.get(row.id as number);
      const newBoard = mapBoard.get(row.board_id as number);
      if (newId == null || newBoard == null) {
        throw new Error("task_group map failure");
      }
      const out = tgCols.map((c) => {
        if (c === "id") {
          return newId;
        }
        if (c === "board_id") {
          return newBoard;
        }
        return row[c] ?? null;
      });
      tgIns.run(...out);
    }

    // list
    const listCols = getColumns(dst, "list");
    const lists = src
      .query(
        `SELECT ${listCols.join(", ")} FROM list ORDER BY board_id, sort_order, id`,
      )
      .all() as Record<string, unknown>[];
    const lIns = dst.prepare(
      `INSERT INTO list (${listCols.join(", ")}) VALUES (${listCols
        .map(() => "?")
        .join(", ")})`,
    );
    for (const row of lists) {
      const newId = mapList.get(row.id as number);
      const newBoard = mapBoard.get(row.board_id as number);
      if (newId == null || newBoard == null) {
        throw new Error("list map failure");
      }
      const out = listCols.map((c) => {
        if (c === "id") {
          return newId;
        }
        if (c === "board_id") {
          return newBoard;
        }
        return row[c] ?? null;
      });
      lIns.run(...out);
    }

    // task_priority
    const tpCols = getColumns(dst, "task_priority");
    const tps = src
      .query(
        `SELECT ${tpCols.join(", ")} FROM task_priority ORDER BY board_id, value, id`,
      )
      .all() as Record<string, unknown>[];
    const tpIns = dst.prepare(
      `INSERT INTO task_priority (${tpCols.join(", ")}) VALUES (${tpCols
        .map(() => "?")
        .join(", ")})`,
    );
    for (const row of tps) {
      const newId = mapPriority.get(row.id as number);
      const newBoard = mapBoard.get(row.board_id as number);
      if (newId == null || newBoard == null) {
        throw new Error("task_priority map failure");
      }
      const out = tpCols.map((c) => {
        if (c === "id") {
          return newId;
        }
        if (c === "board_id") {
          return newBoard;
        }
        return row[c] ?? null;
      });
      tpIns.run(...out);
    }

    // board_release
    const brCols = getColumns(dst, "board_release");
    const brs = src
      .query(
        `SELECT ${brCols.join(", ")} FROM board_release ORDER BY board_id, id`,
      )
      .all() as Record<string, unknown>[];
    const brIns = dst.prepare(
      `INSERT INTO board_release (${brCols.join(", ")}) VALUES (${brCols
        .map(() => "?")
        .join(", ")})`,
    );
    for (const row of brs) {
      const newId = mapRelease.get(row.id as number);
      const newBoard = mapBoard.get(row.board_id as number);
      if (newId == null || newBoard == null) {
        throw new Error("board_release map failure");
      }
      const out = brCols.map((c) => {
        if (c === "id") {
          return newId;
        }
        if (c === "board_id") {
          return newBoard;
        }
        return row[c] ?? null;
      });
      brIns.run(...out);
    }

    // Patch board pointer columns
    const bPatch = src
      .query(
        `SELECT id, default_release_id, default_task_group_id, deleted_group_fallback_id FROM board ORDER BY id`,
      )
      .all() as {
        id: number;
        default_release_id: number | null;
        default_task_group_id: number | null;
        deleted_group_fallback_id: number | null;
      }[];
    const upd = dst.prepare(
      `UPDATE board SET default_release_id = ?, default_task_group_id = ?, deleted_group_fallback_id = ? WHERE id = ?`,
    );
    for (const b of bPatch) {
      const newBid = mapBoard.get(b.id);
      if (newBid == null) {
        throw new Error("board patch map failure");
      }
      const dr =
        b.default_release_id == null
          ? null
          : (mapRelease.get(b.default_release_id) ?? null);
      const dtm =
        b.default_task_group_id == null
          ? null
          : (mapTaskGroup.get(b.default_task_group_id) ?? null);
      const dfb =
        b.deleted_group_fallback_id == null
          ? null
          : (mapTaskGroup.get(b.deleted_group_fallback_id) ?? null);
      upd.run(dr, dtm, dfb, newBid);
    }

    // task
    const taskCols = getColumns(dst, "task");
    const tasks = src
      .query(
        `SELECT ${taskCols.join(", ")} FROM task ORDER BY board_id, list_id, id`,
      )
      .all() as Record<string, unknown>[];
    const tIns = dst.prepare(
      `INSERT INTO task (${taskCols.join(", ")}) VALUES (${taskCols
        .map(() => "?")
        .join(", ")})`,
    );
    for (const row of tasks) {
      const newId = mapTask.get(row.id as number);
      const newList = mapList.get(row.list_id as number);
      const newGroup = mapTaskGroup.get(row.group_id as number);
      const newBoard = mapBoard.get(row.board_id as number);
      if (
        newId == null ||
        newList == null ||
        newGroup == null ||
        newBoard == null
      ) {
        throw new Error("task map failure");
      }
      const newPrio = row.priority_id;
      if (newPrio != null) {
        const mp = mapPriority.get(newPrio as number);
        if (mp == null) {
          throw new Error("task priority_id map failure");
        }
      }
      const out = taskCols.map((c) => {
        if (c === "id") {
          return newId;
        }
        if (c === "list_id") {
          return newList;
        }
        if (c === "group_id") {
          return newGroup;
        }
        if (c === "board_id") {
          return newBoard;
        }
        if (c === "priority_id") {
          return row.priority_id == null
            ? null
            : mapPriority.get(row.priority_id as number) ?? null;
        }
        if (c === "release_id") {
          return row.release_id == null
            ? null
            : (mapRelease.get(row.release_id as number) ?? null);
        }
        return row[c] ?? null;
      });
      tIns.run(...out);
    }

    // board_view_prefs
    const bvpCols = getColumns(dst, "board_view_prefs");
    const bvps = src
      .query(
        `SELECT ${bvpCols.join(", ")} FROM board_view_prefs`,
      )
      .all() as Record<string, unknown>[];
    if (bvps.length > 0) {
      const bvpI = dst.prepare(
        `INSERT INTO board_view_prefs (${bvpCols.join(
          ", ",
        )}) VALUES (${bvpCols.map(() => "?").join(", ")})`,
      );
      for (const row of bvps) {
        const newBoard = mapBoard.get(row.board_id as number);
        if (newBoard == null) {
          throw new Error("board_view_prefs map failure");
        }
        const out = bvpCols.map((c) =>
          c === "board_id" ? newBoard : (row[c] ?? null),
        );
        bvpI.run(...out);
      }
    }

    // board_cli_policy
    const bcpCols = getColumns(dst, "board_cli_policy");
    const bcps = src
      .query(
        `SELECT ${bcpCols.join(", ")} FROM board_cli_policy`,
      )
      .all() as Record<string, unknown>[];
    if (bcps.length > 0) {
      const bcpI = dst.prepare(
        `INSERT INTO board_cli_policy (${bcpCols.join(
          ", ",
        )}) VALUES (${bcpCols.map(() => "?").join(", ")})`,
      );
      for (const row of bcps) {
        const newBoard = mapBoard.get(row.board_id as number);
        if (newBoard == null) {
          throw new Error("board_cli_policy map failure");
        }
        const out = bcpCols.map((c) =>
          c === "board_id" ? newBoard : (row[c] ?? null),
        );
        bcpI.run(...out);
      }
    }

    // notification_event (remap id space 1..n; no FKs in schema)
    const neCols = getColumns(src, "notification_event");
    if (neCols.length > 0) {
      const neRows = src
        .query(
          `SELECT ${neCols.join(", ")} FROM notification_event ORDER BY id`,
        )
        .all() as Record<string, unknown>[];
      let neId = 0;
      const neI = dst.prepare(
        `INSERT INTO notification_event (${neCols.join(
          ", ",
        )}) VALUES (${neCols.map(() => "?").join(", ")})`,
      );
      for (const row of neRows) {
        neId += 1;
        const out = neCols.map((c) => {
          if (c === "id") {
            return neId;
          }
          if (c === "board_id" && row.board_id != null) {
            return mapBoard.get(row.board_id as number) ?? row.board_id;
          }
          if (c === "list_id" && row.list_id != null) {
            return mapList.get(row.list_id as number) ?? row.list_id;
          }
          if (c === "task_id" && row.task_id != null) {
            return mapTask.get(row.task_id as number) ?? row.task_id;
          }
          return row[c] ?? null;
        });
        neI.run(...out);
      }
    }

    // Align AUTOINCREMENT for tables we assigned explicit ids
    setSeq(dst, "board_release");
    setSeq(dst, "notification_event");
  });

  tx();

  dst.run("PRAGMA foreign_keys = ON");
  console.log(
    `Wrote compacted copy (${boardOrder.length} boards, ${mapTask.size} tasks) to ${destPath}`,
  );
} finally {
    src.close();
    dst.close();
  }
}

main();
