import { existsSync } from "node:fs";
import { readFile, rename } from "node:fs/promises";
import path from "node:path";
import type { Database } from "bun:sqlite";
import {
  DEFAULT_STATUS_IDS,
  coerceTaskStatus,
  createDefaultTaskGroups,
  type BoardIndexEntry,
} from "../shared/models";
import { getDb, resolveDataDir, withTransaction } from "./db";

function countRows(db: Database, sql: string): number {
  const row = db.query(sql).get();
  if (row == null || typeof row !== "object" || !("c" in row)) return 0;
  return Number((row as { c: number | bigint }).c);
}

/** Idempotent — migrations usually seed `status` already. */
function ensureStatusSeeded(db: Database): void {
  if (countRows(db, "SELECT COUNT(*) AS c FROM status") > 0) return;
  db.exec(`
INSERT INTO status (id, label, sort_order, is_closed) VALUES
  ('open',        'Open',        0, 0),
  ('in-progress', 'In Progress', 1, 0),
  ('closed',      'Closed',      2, 1);
`);
}

/** Stable string key for legacy JSON ids (nanoid strings, numeric strings, numbers). */
function legacyIdKey(raw: unknown, fallbackIndex: number): string {
  if (raw === null || raw === undefined) return String(fallbackIndex);
  return String(raw);
}

/**
 * Parses board JSON for one-time import without coercing ids to numbers.
 * `normalizeBoardFromJson` maps unknown string ids to 0 and breaks list/task FK mapping.
 */
function parseLegacyBoardJsonForImport(
  raw: Record<string, unknown>,
): LegacyBoardImport {
  const name = typeof raw.name === "string" ? raw.name : "";
  const createdAt =
    typeof raw.createdAt === "string"
      ? raw.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt;

  const taskGroupsRaw = Array.isArray(raw.taskGroups) ? raw.taskGroups : [];
  const taskGroups: { key: string; label: string }[] = [];
  for (let i = 0; i < taskGroupsRaw.length; i++) {
    const item = taskGroupsRaw[i];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const label = typeof rec.label === "string" ? rec.label.trim() : "";
    if (!label) continue;
    const key =
      rec.id !== undefined && rec.id !== null
        ? legacyIdKey(rec.id, i)
        : String(i);
    taskGroups.push({ key, label });
  }
  if (taskGroups.length === 0) {
    for (const g of createDefaultTaskGroups()) {
      taskGroups.push({ key: String(g.id), label: g.label });
    }
  }

  const listsRaw = Array.isArray(raw.lists) ? raw.lists : [];
  const lists: {
    key: string;
    name: string;
    order: number;
    color: string | null;
  }[] = [];
  for (let i = 0; i < listsRaw.length; i++) {
    const l = listsRaw[i];
    if (!l || typeof l !== "object") continue;
    const rec = l as Record<string, unknown>;
    const key =
      rec.id !== undefined && rec.id !== null
        ? legacyIdKey(rec.id, i)
        : String(i);
    lists.push({
      key,
      name: typeof rec.name === "string" ? rec.name : "",
      order: typeof rec.order === "number" ? rec.order : 0,
      color: typeof rec.color === "string" ? rec.color : null,
    });
  }

  const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
  const firstGroupKey = taskGroups[0]!.key;
  const tasks: LegacyTaskImport[] = [];
  for (const t of tasksRaw) {
    if (!t || typeof t !== "object") continue;
    const tr = t as Record<string, unknown>;
    const listRaw = tr.listId;
    const listKey =
      listRaw !== undefined && listRaw !== null
        ? legacyIdKey(listRaw, 0)
        : "";
    const groupRaw = tr.groupId ?? tr.group;
    const groupKey =
      groupRaw !== undefined && groupRaw !== null
        ? legacyIdKey(groupRaw, 0)
        : firstGroupKey;
    tasks.push({
      listKey,
      groupKey,
      title: typeof tr.title === "string" ? tr.title : "",
      body: typeof tr.body === "string" ? tr.body : "",
      status: typeof tr.status === "string" ? tr.status : "",
      order: typeof tr.order === "number" ? tr.order : 0,
      color: typeof tr.color === "string" ? tr.color : null,
      createdAt:
        typeof tr.createdAt === "string"
          ? tr.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof tr.updatedAt === "string"
          ? tr.updatedAt
          : new Date().toISOString(),
    });
  }

  const allowed = DEFAULT_STATUS_IDS as readonly string[];
  const visibleStatusesRaw = Array.isArray(raw.visibleStatuses)
    ? [...(raw.visibleStatuses as string[])]
    : [...allowed];
  const visibleStatuses = visibleStatusesRaw.filter((s) => allowed.includes(s));
  const visibleStatusesFinal =
    visibleStatuses.length > 0 ? visibleStatuses : [...allowed];

  const layoutRaw = raw.boardLayout;
  const boardLayout =
    layoutRaw === "stacked" || layoutRaw === "lanes" ? layoutRaw : null;

  const boardColor =
    typeof raw.boardColor === "string" ? raw.boardColor : null;
  const backgroundImage =
    typeof raw.backgroundImage === "string" ? raw.backgroundImage : null;

  return {
    name,
    createdAt,
    updatedAt,
    visibleStatuses: visibleStatusesFinal,
    statusBandWeights: Array.isArray(raw.statusBandWeights)
      ? [...(raw.statusBandWeights as number[])]
      : undefined,
    boardLayout,
    boardColor,
    backgroundImage,
    showCounts: Boolean(raw.showCounts),
    taskGroups,
    lists,
    tasks,
  };
}

interface LegacyTaskImport {
  listKey: string;
  groupKey: string;
  title: string;
  body: string;
  status: string;
  order: number;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LegacyBoardImport {
  name: string;
  createdAt: string;
  updatedAt: string;
  visibleStatuses: string[];
  statusBandWeights: number[] | undefined;
  boardLayout: string | null;
  boardColor: string | null;
  backgroundImage: string | null;
  showCounts: boolean;
  taskGroups: { key: string; label: string }[];
  lists: {
    key: string;
    name: string;
    order: number;
    color: string | null;
  }[];
  tasks: LegacyTaskImport[];
}

function importOneBoard(
  db: Database,
  indexEntry: BoardIndexEntry,
  json: LegacyBoardImport,
): void {
  const boardResult = db.run(
    "INSERT INTO board (name, slug, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [json.name, indexEntry.slug, json.createdAt, json.updatedAt],
  );
  const boardId = Number(boardResult.lastInsertRowid);

  const allowedStatusIds = (
    db.query("SELECT id FROM status ORDER BY sort_order ASC, id ASC").all() as {
      id: string;
    }[]
  ).map((r) => r.id);

  const groupIdMap = new Map<string, number>();
  for (const group of json.taskGroups) {
    const r = db.run(
      "INSERT INTO task_group (board_id, label) VALUES (?, ?)",
      [boardId, group.label],
    );
    groupIdMap.set(group.key, Number(r.lastInsertRowid));
  }

  const firstGroupId = groupIdMap.values().next().value as number | undefined;
  if (firstGroupId === undefined) {
    throw new Error(`[import] Board "${json.name}" has no task groups`);
  }

  const listIdMap = new Map<string, number>();
  for (const list of json.lists) {
    const r = db.run(
      "INSERT INTO list (board_id, name, sort_order, color) VALUES (?, ?, ?, ?)",
      [boardId, list.name, list.order, list.color ?? null],
    );
    listIdMap.set(list.key, Number(r.lastInsertRowid));
  }

  for (const task of json.tasks) {
    const listId = listIdMap.get(task.listKey);
    if (listId === undefined) {
      console.warn(
        `[import] Skipping task "${task.title}": unknown listId key ${task.listKey}`,
      );
      continue;
    }
    const groupId = groupIdMap.get(task.groupKey) ?? firstGroupId;
    const statusId = coerceTaskStatus(task.status, allowedStatusIds);

    db.run(
      `INSERT INTO task (list_id, group_id, board_id, status_id,
         title, body, sort_order, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        listId,
        groupId,
        boardId,
        statusId,
        task.title,
        task.body,
        task.order,
        task.color ?? null,
        task.createdAt,
        task.updatedAt,
      ],
    );
  }

  db.run(
    `INSERT INTO board_view_prefs
       (board_id, visible_statuses, status_band_weights,
        board_layout, board_color, background_image, show_counts)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      boardId,
      JSON.stringify(json.visibleStatuses),
      json.statusBandWeights
        ? JSON.stringify(json.statusBandWeights)
        : null,
      json.boardLayout ?? null,
      json.boardColor ?? null,
      json.backgroundImage ?? null,
      json.showCounts ? 1 : 0,
    ],
  );
}

async function archiveJsonSources(dataDir: string): Promise<void> {
  const boardsDir = path.join(dataDir, "boards");
  const boardsImported = path.join(dataDir, "boards_imported");
  const indexPath = path.join(dataDir, "_index.json");
  const indexImported = path.join(dataDir, "_index.imported.json");

  if (existsSync(boardsDir)) {
    if (existsSync(boardsImported)) {
      console.warn(
        "[import] data/boards_imported already exists; skipping boards directory rename",
      );
    } else {
      await rename(boardsDir, boardsImported);
    }
  }

  if (existsSync(indexPath)) {
    if (existsSync(indexImported)) {
      console.warn(
        "[import] _index.imported.json already exists; skipping index rename",
      );
    } else {
      await rename(indexPath, indexImported);
    }
  }
}

/**
 * If `board` is empty and `data/_index.json` lists boards, loads each
 * `data/boards/<slug>.json`, inserts rows with nanoid → integer mapping, then
 * renames `boards/` → `boards_imported/` and `_index.json` → `_index.imported.json`.
 *
 * Expects migrations to have run so tables exist. No-op when `board` already has rows.
 */
export async function importFromJsonIfNeeded(): Promise<void> {
  const db = getDb();

  if (countRows(db, "SELECT COUNT(*) AS c FROM board") > 0) {
    return;
  }

  const dataDir = resolveDataDir();
  const indexPath = path.join(dataDir, "_index.json");
  const boardsDir = path.join(dataDir, "boards");

  let index: BoardIndexEntry[];
  try {
    const raw = await readFile(indexPath, "utf-8");
    index = JSON.parse(raw) as BoardIndexEntry[];
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw e;
  }

  if (!Array.isArray(index) || index.length === 0) {
    return;
  }

  if (!existsSync(boardsDir)) {
    console.warn(
      "[import] _index.json has entries but data/boards is missing; skipping JSON import",
    );
    return;
  }

  const payloads: { entry: BoardIndexEntry; board: LegacyBoardImport }[] = [];

  for (const entry of index) {
    if (!entry.slug?.length) {
      console.warn(`[import] Skipping index entry without slug (id=${entry.id})`);
      continue;
    }
    const filePath = path.join(boardsDir, `${entry.slug}.json`);
    const rawJson = JSON.parse(
      await readFile(filePath, "utf-8"),
    ) as Record<string, unknown>;
    const board = parseLegacyBoardJsonForImport(rawJson);
    payloads.push({ entry, board });
  }

  if (payloads.length === 0) {
    return;
  }

  withTransaction(db, () => {
    ensureStatusSeeded(db);
    for (const { entry, board } of payloads) {
      importOneBoard(db, entry, board);
    }
  });

  await archiveJsonSources(dataDir);
}
