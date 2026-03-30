import { mkdir } from "node:fs/promises";
import type { Database } from "bun:sqlite";
import { parseBoardColor } from "../shared/boardColor";
import {
  DEFAULT_STATUS_IDS,
  coerceTaskStatus,
  createDefaultTaskGroups,
  type Board,
  type BoardIndexEntry,
  type GroupDefinition,
  type List,
  type Status,
  type Task,
} from "../shared/models";
import { slugify, uniqueSlug } from "../shared/slug";
import { getDb, resolveDataDir, withTransaction } from "./db";

/** Ensures the data directory exists (see docs/sqlite_migration §5a / §5d). */
export async function ensureDataDir(): Promise<void> {
  await mkdir(resolveDataDir(), { recursive: true });
}

/** Rows from `status` for `GET /api/statuses`. */
export function listStatuses(): Status[] {
  const db = getDb();
  const rows = db
    .query(
      "SELECT id, label, sort_order, is_closed FROM status ORDER BY sort_order ASC, id ASC",
    )
    .all() as {
    id: string;
    label: string;
    sort_order: number;
    is_closed: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    sortOrder: r.sort_order,
    isClosed: r.is_closed !== 0,
  }));
}

function mapIndexRow(row: {
  id: number;
  slug: string;
  name: string;
  created_at: string;
}): BoardIndexEntry {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    createdAt: row.created_at,
  };
}

export async function readBoardIndex(): Promise<BoardIndexEntry[]> {
  const db = getDb();
  const rows = db
    .query(
      "SELECT id, slug, name, created_at FROM board ORDER BY name COLLATE NOCASE",
    )
    .all() as {
    id: number;
    slug: string;
    name: string;
    created_at: string;
  }[];
  return rows.map(mapIndexRow);
}

/** Lookup by integer id string or by slug. */
export async function entryByIdOrSlug(
  ref: string,
): Promise<BoardIndexEntry | null> {
  const db = getDb();
  if (/^\d+$/.test(ref)) {
    const row = db
      .query(
        "SELECT id, slug, name, created_at FROM board WHERE id = ?",
      )
      .get(Number(ref)) as {
      id: number;
      slug: string;
      name: string;
      created_at: string;
    } | null;
    if (row) return mapIndexRow(row);
  }
  const row2 = db
    .query(
      "SELECT id, slug, name, created_at FROM board WHERE slug = ?",
    )
    .get(ref) as {
    id: number;
    slug: string;
    name: string;
    created_at: string;
  } | null;
  return row2 ? mapIndexRow(row2) : null;
}

function parseJsonColumn<T>(raw: string | null, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function statusWorkflowOrder(db: Database): string[] {
  const rows = db
    .query("SELECT id FROM status ORDER BY sort_order ASC, id ASC")
    .all() as { id: string }[];
  return rows.map((r) => r.id);
}

/**
 * Keep visible statuses in workflow order, drop unknown ids, default to full workflow when empty.
 * Drop band weights when length/values do not match visible statuses (client will recompute).
 */
function normalizeBoardViewState(
  db: Database,
  visibleStatuses: string[],
  statusBandWeights: number[] | undefined,
): { visibleStatuses: string[]; statusBandWeights: number[] | undefined } {
  const workflowOrder = statusWorkflowOrder(db);
  const allowed = new Set(workflowOrder);
  let vis = visibleStatuses.filter((s) => allowed.has(s));
  if (vis.length === 0) {
    vis = [...workflowOrder];
  } else {
    vis = workflowOrder.filter((s) => vis.includes(s));
  }
  let weights = statusBandWeights;
  if (
    !weights ||
    weights.length !== vis.length ||
    !weights.every((n) => Number.isFinite(n) && n > 0)
  ) {
    weights = undefined;
  }
  return { visibleStatuses: vis, statusBandWeights: weights };
}

export function loadBoard(boardId: number): Board | null {
  const db = getDb();
  const boardRow = db
    .query(
      "SELECT id, name, slug, created_at, updated_at FROM board WHERE id = ?",
    )
    .get(boardId) as
    | {
        id: number;
        name: string;
        slug: string;
        created_at: string;
        updated_at: string;
      }
    | null;
  if (!boardRow) return null;

  const prefs = db
    .query(
      "SELECT visible_statuses, status_band_weights, board_layout, board_color, background_image, show_counts FROM board_view_prefs WHERE board_id = ?",
    )
    .get(boardId) as
    | {
        visible_statuses: string | null;
        status_band_weights: string | null;
        board_layout: string | null;
        board_color: string | null;
        background_image: string | null;
        show_counts: number | null;
      }
    | null;

  const groupRows = db
    .query(
      "SELECT id, label FROM task_group WHERE board_id = ? ORDER BY id",
    )
    .all(boardId) as { id: number; label: string }[];

  const taskGroups: GroupDefinition[] = groupRows.map((g) => ({
    id: g.id,
    label: g.label,
  }));

  const listRows = db
    .query(
      "SELECT id, name, sort_order, color FROM list WHERE board_id = ? ORDER BY sort_order, id",
    )
    .all(boardId) as {
    id: number;
    name: string;
    sort_order: number;
    color: string | null;
  }[];

  const lists: List[] = listRows.map((l) => ({
    id: l.id,
    name: l.name,
    order: l.sort_order,
    color: l.color ?? undefined,
  }));

  const taskRows = db
    .query(
      `SELECT id, list_id, group_id, status_id, title, body, sort_order, color, created_at, updated_at
       FROM task WHERE board_id = ? ORDER BY list_id, status_id, sort_order, id`,
    )
    .all(boardId) as {
    id: number;
    list_id: number;
    group_id: number;
    status_id: string;
    title: string;
    body: string;
    sort_order: number;
    color: string | null;
    created_at: string;
    updated_at: string;
  }[];

  const tasks: Task[] = taskRows.map((t) => ({
    id: t.id,
    listId: t.list_id,
    title: t.title,
    body: t.body,
    groupId: t.group_id,
    status: t.status_id as Task["status"],
    order: t.sort_order,
    color: t.color ?? undefined,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));

  const rawVis = prefs?.visible_statuses
    ? parseJsonColumn<string[]>(prefs.visible_statuses, [])
    : [];
  const rawWeights = prefs?.status_band_weights
    ? parseJsonColumn<number[] | undefined>(
        prefs.status_band_weights,
        undefined,
      )
    : undefined;
  const { visibleStatuses, statusBandWeights } = normalizeBoardViewState(
    db,
    rawVis.length > 0 ? rawVis : statusWorkflowOrder(db),
    rawWeights,
  );

  return {
    id: boardRow.id,
    slug: boardRow.slug,
    name: boardRow.name,
    backgroundImage: prefs?.background_image ?? undefined,
    boardColor: parseBoardColor(prefs?.board_color ?? undefined),
    taskGroups,
    visibleStatuses,
    statusBandWeights,
    boardLayout:
      prefs?.board_layout === "lanes" || prefs?.board_layout === "stacked"
        ? prefs.board_layout
        : undefined,
    showCounts: prefs ? Boolean(prefs.show_counts) : true,
    lists,
    tasks,
    createdAt: boardRow.created_at,
    updatedAt: boardRow.updated_at,
  };
}

export async function generateSlug(
  name: string,
  excludeId?: string,
): Promise<string> {
  const db = getDb();
  const rows = db.query("SELECT id, slug FROM board").all() as {
    id: number;
    slug: string;
  }[];
  const excludeNum =
    excludeId != null ? Number(excludeId) : Number.NaN;
  const taken = new Set(
    rows
      .filter(
        (r) =>
          !Number.isFinite(excludeNum) || r.id !== excludeNum,
      )
      .map((r) => r.slug),
  );
  return uniqueSlug(slugify(name), taken);
}

export async function deleteBoardById(id: number): Promise<void> {
  const db = getDb();
  db.run("DELETE FROM board WHERE id = ?", [id]);
}

/** Create board row, default groups, default view prefs; returns full board. */
export async function createBoardWithDefaults(
  name: string,
  slug: string,
): Promise<Board> {
  const now = new Date().toISOString();
  const boardId = withTransaction(getDb(), () => {
    const db = getDb();
    const r = db.run(
      "INSERT INTO board (name, slug, created_at, updated_at) VALUES (?, ?, ?, ?)",
      [name, slug, now, now],
    );
    const id = Number(r.lastInsertRowid);
    const groups = createDefaultTaskGroups();
    for (const g of groups) {
      db.run(
        "INSERT INTO task_group (board_id, label) VALUES (?, ?)",
        [id, g.label],
      );
    }
    db.run(
      `INSERT INTO board_view_prefs
         (board_id, visible_statuses, status_band_weights,
          board_layout, board_color, background_image, show_counts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        JSON.stringify([...DEFAULT_STATUS_IDS]),
        JSON.stringify([1, 1, 1]),
        "stacked",
        null,
        null,
        1,
      ],
    );
    return id;
  });
  const loaded = loadBoard(boardId);
  if (!loaded) throw new Error("Failed to load board after create");
  return loaded;
}

function boardExists(db: Database, boardId: number): boolean {
  const row = db
    .query("SELECT 1 AS ok FROM board WHERE id = ?")
    .get(boardId) as { ok: number } | null;
  return row != null;
}

/** Sync task groups (insert/update/delete); remaps tasks when groups are removed. */
function applyTaskGroupChanges(
  db: Database,
  boardId: number,
  taskGroups: GroupDefinition[],
): void {
  if (taskGroups.length === 0) {
    throw new Error("Board must have at least one task group");
  }

  const keptGroupIds = new Set<number>();

  for (const g of taskGroups) {
    if (g.id > 0) {
      const row = db
        .query("SELECT id FROM task_group WHERE id = ? AND board_id = ?")
        .get(g.id, boardId) as { id: number } | null;
      if (row) {
        db.run("UPDATE task_group SET label = ? WHERE id = ?", [g.label, g.id]);
        keptGroupIds.add(g.id);
      } else {
        const r = db.run(
          "INSERT INTO task_group (board_id, label) VALUES (?, ?)",
          [boardId, g.label],
        );
        keptGroupIds.add(Number(r.lastInsertRowid));
      }
    } else {
      const r = db.run(
        "INSERT INTO task_group (board_id, label) VALUES (?, ?)",
        [boardId, g.label],
      );
      keptGroupIds.add(Number(r.lastInsertRowid));
    }
  }

  const existingGroups = db
    .query("SELECT id FROM task_group WHERE board_id = ?")
    .all(boardId) as { id: number }[];
  const fallbackGroupId = [...keptGroupIds][0]!;
  for (const { id: gid } of existingGroups) {
    if (!keptGroupIds.has(gid)) {
      db.run("UPDATE task SET group_id = ? WHERE group_id = ?", [
        fallbackGroupId,
        gid,
      ]);
      db.run("DELETE FROM task_group WHERE id = ?", [gid]);
    }
  }
}

export async function patchBoardName(
  boardId: number,
  name: string,
): Promise<Board | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const existing = loadBoard(boardId);
  if (!existing) return null;
  if (existing.name === trimmed) return existing;

  const newSlug = await generateSlug(trimmed, String(boardId));
  const now = new Date().toISOString();
  withTransaction(db, () => {
    db.run("UPDATE board SET name = ?, slug = ?, updated_at = ? WHERE id = ?", [
      trimmed,
      newSlug,
      now,
      boardId,
    ]);
  });
  return loadBoard(boardId);
}

export function patchBoardViewPrefs(
  boardId: number,
  patch: {
    visibleStatuses?: string[];
    statusBandWeights?: number[];
    boardLayout?: Board["boardLayout"];
    boardColor?: Board["boardColor"];
    backgroundImage?: string | null;
    showCounts?: boolean;
  },
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;

  const row = db
    .query(
      "SELECT visible_statuses, status_band_weights, board_layout, board_color, background_image, show_counts FROM board_view_prefs WHERE board_id = ?",
    )
    .get(boardId) as {
    visible_statuses: string | null;
    status_band_weights: string | null;
    board_layout: string | null;
    board_color: string | null;
    background_image: string | null;
    show_counts: number | null;
  } | null;

  if (!row) return null;

  const curVis = parseJsonColumn<string[]>(row.visible_statuses, []);
  const curWeights = parseJsonColumn<number[] | undefined>(
    row.status_band_weights,
    undefined,
  );

  let nextVis = patch.visibleStatuses ?? curVis;
  let nextWeights = patch.statusBandWeights ?? curWeights;
  const layout =
    patch.boardLayout !== undefined
      ? patch.boardLayout
      : row.board_layout === "lanes" || row.board_layout === "stacked"
        ? row.board_layout
        : undefined;
  const boardColor =
    patch.boardColor !== undefined ? patch.boardColor : row.board_color;
  const bg =
    patch.backgroundImage !== undefined
      ? patch.backgroundImage
      : row.background_image;
  const showCounts =
    patch.showCounts !== undefined
      ? patch.showCounts
      : Boolean(row.show_counts);

  const view = normalizeBoardViewState(db, nextVis, nextWeights);
  nextVis = view.visibleStatuses;
  nextWeights = view.statusBandWeights;

  const now = new Date().toISOString();
  withTransaction(db, () => {
    db.run(
      `INSERT OR REPLACE INTO board_view_prefs
         (board_id, visible_statuses, status_band_weights,
          board_layout, board_color, background_image, show_counts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        boardId,
        JSON.stringify(nextVis),
        nextWeights ? JSON.stringify(nextWeights) : null,
        layout ?? null,
        boardColor ?? null,
        bg ?? null,
        showCounts ? 1 : 0,
      ],
    );
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });

  return loadBoard(boardId);
}

export function patchBoardTaskGroups(
  boardId: number,
  taskGroups: GroupDefinition[],
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const now = new Date().toISOString();
  withTransaction(db, () => {
    applyTaskGroupChanges(db, boardId, taskGroups);
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}

export function createListOnBoard(boardId: number, name: string): Board | null {
  const trimmed = name.trim() || "New list";
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const now = new Date().toISOString();
  withTransaction(db, () => {
    const maxRow = db
      .query(
        "SELECT COALESCE(MAX(sort_order), -1) AS m FROM list WHERE board_id = ?",
      )
      .get(boardId) as { m: number };
    const nextOrder = maxRow.m + 1;
    db.run(
      "INSERT INTO list (board_id, name, sort_order, color) VALUES (?, ?, ?, ?)",
      [boardId, trimmed, nextOrder, null],
    );
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}

export function patchListOnBoard(
  boardId: number,
  listId: number,
  updates: { name?: string; color?: string | null },
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const row = db
    .query("SELECT id FROM list WHERE id = ? AND board_id = ?")
    .get(listId, boardId) as { id: number } | null;
  if (!row) return null;

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (updates.name !== undefined) {
    sets.push("name = ?");
    vals.push(updates.name.trim());
  }
  if (updates.color !== undefined) {
    sets.push("color = ?");
    vals.push(updates.color);
  }
  if (sets.length === 0) return loadBoard(boardId);

  const now = new Date().toISOString();
  vals.push(listId, boardId);
  withTransaction(db, () => {
    db.run(
      `UPDATE list SET ${sets.join(", ")} WHERE id = ? AND board_id = ?`,
      vals as Parameters<typeof db.run>[1],
    );
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}

export function deleteListOnBoard(boardId: number, listId: number): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const row = db
    .query("SELECT id FROM list WHERE id = ? AND board_id = ?")
    .get(listId, boardId) as { id: number } | null;
  if (!row) return null;
  const now = new Date().toISOString();
  withTransaction(db, () => {
    db.run("DELETE FROM list WHERE id = ?", [listId]);
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}

export function reorderListsOnBoard(
  boardId: number,
  orderedListIds: number[],
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const rows = db
    .query("SELECT id FROM list WHERE board_id = ?")
    .all(boardId) as { id: number }[];
  const ids = new Set(rows.map((r) => r.id));
  if (orderedListIds.length !== ids.size) return null;
  for (const id of orderedListIds) {
    if (!ids.has(id)) return null;
  }
  const now = new Date().toISOString();
  withTransaction(db, () => {
    orderedListIds.forEach((listId, order) => {
      db.run("UPDATE list SET sort_order = ? WHERE id = ? AND board_id = ?", [
        order,
        listId,
        boardId,
      ]);
    });
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}

export function createTaskOnBoard(
  boardId: number,
  input: {
    listId: number;
    status: string;
    title: string;
    body: string;
    groupId: number;
  },
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;

  const listRow = db
    .query("SELECT id FROM list WHERE id = ? AND board_id = ?")
    .get(input.listId, boardId) as { id: number } | null;
  if (!listRow) return null;

  const gRow = db
    .query("SELECT id FROM task_group WHERE id = ? AND board_id = ?")
    .get(input.groupId, boardId) as { id: number } | null;
  if (!gRow) return null;

  const allowedStatusIds = (
    db.query("SELECT id FROM status ORDER BY sort_order ASC, id ASC").all() as {
      id: string;
    }[]
  ).map((r) => r.id);
  const statusId = coerceTaskStatus(input.status, allowedStatusIds);

  const bandRows = db
    .query(
      `SELECT sort_order FROM task WHERE board_id = ? AND list_id = ? AND status_id = ?`,
    )
    .all(boardId, input.listId, statusId) as { sort_order: number }[];
  const maxOrder = bandRows.reduce(
    (m, r) => Math.max(m, r.sort_order),
    -1,
  );

  const now = new Date().toISOString();
  withTransaction(db, () => {
    db.run(
      `INSERT INTO task (list_id, group_id, board_id, status_id,
         title, body, sort_order, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.listId,
        input.groupId,
        boardId,
        statusId,
        input.title,
        input.body,
        maxOrder + 1,
        null,
        now,
        now,
      ],
    );
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}

export function patchTaskOnBoard(
  boardId: number,
  taskId: number,
  patch: Partial<{
    title: string;
    body: string;
    listId: number;
    groupId: number;
    status: string;
    order: number;
    color: string | null;
  }>,
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;

  const trow = db
    .query(
      `SELECT id, list_id, group_id, status_id, title, body, sort_order, color, created_at, updated_at
       FROM task WHERE id = ? AND board_id = ?`,
    )
    .get(taskId, boardId) as {
    id: number;
    list_id: number;
    group_id: number;
    status_id: string;
    title: string;
    body: string;
    sort_order: number;
    color: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  if (!trow) return null;

  let listId = patch.listId ?? trow.list_id;
  let groupId = patch.groupId ?? trow.group_id;
  const allowedStatusIds = (
    db.query("SELECT id FROM status ORDER BY sort_order ASC, id ASC").all() as {
      id: string;
    }[]
  ).map((r) => r.id);
  let statusId =
    patch.status !== undefined
      ? coerceTaskStatus(patch.status, allowedStatusIds)
      : trow.status_id;

  const listOk = db
    .query("SELECT id FROM list WHERE id = ? AND board_id = ?")
    .get(listId, boardId) as { id: number } | null;
  if (!listOk) return null;

  const gOk = db
    .query("SELECT id FROM task_group WHERE id = ? AND board_id = ?")
    .get(groupId, boardId) as { id: number } | null;
  if (!gOk) return null;

  const statusChanged = trow.status_id !== statusId;
  const listChanged = trow.list_id !== listId;
  let order: number;
  if (statusChanged || listChanged) {
    const others = db
      .query(
        `SELECT sort_order FROM task WHERE board_id = ? AND list_id = ? AND status_id = ? AND id != ?`,
      )
      .all(boardId, listId, statusId, taskId) as { sort_order: number }[];
    order = others.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
  } else {
    order = patch.order ?? trow.sort_order;
  }

  const title = patch.title ?? trow.title;
  const body = patch.body ?? trow.body;
  const color = patch.color !== undefined ? patch.color : trow.color;
  const now = new Date().toISOString();

  withTransaction(db, () => {
    db.run(
      `UPDATE task SET list_id = ?, group_id = ?, status_id = ?, title = ?, body = ?,
         sort_order = ?, color = ?, updated_at = ? WHERE id = ?`,
      [
        listId,
        groupId,
        statusId,
        title,
        body,
        order,
        color,
        now,
        taskId,
      ],
    );
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}

export function deleteTaskOnBoard(
  boardId: number,
  taskId: number,
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const row = db
    .query("SELECT id FROM task WHERE id = ? AND board_id = ?")
    .get(taskId, boardId) as { id: number } | null;
  if (!row) return null;
  const now = new Date().toISOString();
  withTransaction(db, () => {
    db.run("DELETE FROM task WHERE id = ?", [taskId]);
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}

export function reorderTasksInBand(
  boardId: number,
  listId: number,
  status: string,
  orderedTaskIds: number[],
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;

  const allowedStatusIds = (
    db.query("SELECT id FROM status ORDER BY sort_order ASC, id ASC").all() as {
      id: string;
    }[]
  ).map((r) => r.id);
  const statusId = coerceTaskStatus(status, allowedStatusIds);

  const band = db
    .query(
      `SELECT id FROM task WHERE board_id = ? AND list_id = ? AND status_id = ? ORDER BY sort_order, id`,
    )
    .all(boardId, listId, statusId) as { id: number }[];

  if (band.length !== orderedTaskIds.length) return null;
  const idSet = new Set(band.map((b) => b.id));
  for (const id of orderedTaskIds) {
    if (!idSet.has(id)) return null;
  }

  const now = new Date().toISOString();
  withTransaction(db, () => {
    orderedTaskIds.forEach((tid, i) => {
      db.run(
        "UPDATE task SET sort_order = ?, updated_at = ? WHERE id = ? AND board_id = ?",
        [i, now, tid, boardId],
      );
    });
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}
