import { mkdir } from "node:fs/promises";
import type { Database } from "bun:sqlite";
import { DEFAULT_BOARD_COLOR, parseBoardColor } from "../../shared/boardColor";
import {
  DEFAULT_STATUS_IDS,
  createDefaultTaskGroups,
  createDefaultTaskPriorities,
  sortPrioritiesByValue,
  type Board,
  type BoardIndexEntry,
  type GroupDefinition,
  type List,
  type Status,
  type Task,
  type TaskPriorityDefinition,
} from "../../shared/models";
import { slugify, uniqueSlug } from "../../shared/slug";
import { getDb, resolveDataDir, withTransaction } from "../db";
import {
  boardExists,
  normalizeBoardViewState,
  parseJsonColumn,
  statusWorkflowOrder,
} from "./helpers";

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

  const priorityRows = db
    .query(
      "SELECT id, value, label, color, is_system FROM task_priority WHERE board_id = ? ORDER BY value, id",
    )
    .all(boardId) as {
    id: number;
    value: number;
    label: string;
    color: string;
    is_system: number;
  }[];

  const taskPriorities: TaskPriorityDefinition[] = sortPrioritiesByValue(
    priorityRows.map((p) => ({
      id: p.id,
      value: p.value,
      label: p.label,
      color: p.color,
      isSystem: p.is_system !== 0,
    })),
  );

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
      `SELECT id, list_id, group_id, priority_id, status_id, title, body, sort_order, color, created_at, updated_at, closed_at
       FROM task WHERE board_id = ? ORDER BY list_id, status_id, sort_order, id`,
    )
    .all(boardId) as {
    id: number;
    list_id: number;
    group_id: number;
    priority_id: number | null;
    status_id: string;
    title: string;
    body: string;
    sort_order: number;
    color: string | null;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
  }[];

  const tasks: Task[] = taskRows.map((t) => ({
    id: t.id,
    listId: t.list_id,
    title: t.title,
    body: t.body,
    groupId: t.group_id,
    priorityId: t.priority_id,
    status: t.status_id as Task["status"],
    order: t.sort_order,
    color: t.color ?? undefined,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    closedAt: t.closed_at ?? undefined,
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
    taskPriorities,
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

/** Create board row, default groups/priorities, default view prefs; returns full board. */
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
    // Seed built-in priorities here so every new board can assign them immediately.
    const priorities = createDefaultTaskPriorities();
    for (const priority of priorities) {
      db.run(
        "INSERT INTO task_priority (board_id, value, label, color, is_system) VALUES (?, ?, ?, ?, ?)",
        [
          id,
          priority.value,
          priority.label,
          priority.color,
          priority.isSystem ? 1 : 0,
        ],
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
        // Persist explicit default so DB matches client `DEFAULT_BOARD_COLOR` (neutral stone).
        DEFAULT_BOARD_COLOR,
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

/** Sync priorities while preserving built-in rows and clearing deleted assignments. */
function applyTaskPriorityChanges(
  db: Database,
  boardId: number,
  taskPriorities: TaskPriorityDefinition[],
): void {
  const normalized = taskPriorities.map((priority) => ({
    id: priority.id,
    value: priority.value,
    label: priority.label.trim(),
    color: priority.color.trim(),
    isSystem: priority.isSystem,
  }));
  if (normalized.length === 0) {
    throw new Error("Board must have at least one task priority");
  }
  for (const priority of normalized) {
    if (!Number.isFinite(priority.value) || !Number.isInteger(priority.value)) {
      throw new Error("Priority values must be integers");
    }
    if (!priority.label) {
      throw new Error("Priority labels are required");
    }
    if (!priority.color) {
      throw new Error("Priority colors are required");
    }
  }
  const valueSet = new Set<number>();
  for (const priority of normalized) {
    if (valueSet.has(priority.value)) {
      throw new Error("Priority values must be unique");
    }
    valueSet.add(priority.value);
  }

  const existingRows = db
    .query(
      "SELECT id, value, is_system FROM task_priority WHERE board_id = ? ORDER BY value, id",
    )
    .all(boardId) as { id: number; value: number; is_system: number }[];
  const existingById = new Map(existingRows.map((row) => [row.id, row] as const));
  // Match built-in rows by id so clients can rename/recolor them without being able
  // to delete or renumber the seeded value slots.
  for (const row of existingRows) {
    if (row.is_system === 0) continue;
    const incoming = normalized.find((priority) => priority.id === row.id);
    if (!incoming) {
      throw new Error("Built-in priorities cannot be deleted");
    }
    if (incoming.value !== row.value) {
      throw new Error("Built-in priorities cannot change numeric value");
    }
  }

  const keptPriorityIds = new Set<number>();
  for (const priority of normalized) {
    const existing = existingById.get(priority.id);
    if (existing) {
      if (existing.is_system !== 0) {
        db.run(
          "UPDATE task_priority SET label = ?, color = ? WHERE id = ?",
          [priority.label, priority.color, priority.id],
        );
      } else {
        db.run(
          "UPDATE task_priority SET value = ?, label = ?, color = ? WHERE id = ?",
          [priority.value, priority.label, priority.color, priority.id],
        );
      }
      keptPriorityIds.add(priority.id);
      continue;
    }

    const result = db.run(
      "INSERT INTO task_priority (board_id, value, label, color, is_system) VALUES (?, ?, ?, ?, ?)",
      [boardId, priority.value, priority.label, priority.color, 0],
    );
    keptPriorityIds.add(Number(result.lastInsertRowid));
  }

  for (const row of existingRows) {
    if (row.is_system !== 0 || keptPriorityIds.has(row.id)) continue;
    // Clear assignments before deleting custom priorities so task edits can leave
    // tasks unassigned after the row disappears.
    db.run("UPDATE task SET priority_id = NULL WHERE priority_id = ?", [row.id]);
    db.run("DELETE FROM task_priority WHERE id = ?", [row.id]);
  }
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

export function patchBoardTaskPriorities(
  boardId: number,
  taskPriorities: TaskPriorityDefinition[],
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const now = new Date().toISOString();
  withTransaction(db, () => {
    applyTaskPriorityChanges(db, boardId, taskPriorities);
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}
