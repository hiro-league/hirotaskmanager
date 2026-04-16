import { DEFAULT_BOARD_COLOR, parseBoardColor } from "../../../shared/boardColor";
import {
  EMPTY_BOARD_CLI_POLICY,
  normalizeBoardCliPolicyImplied,
  type BoardCliPolicy,
} from "../../../shared/cliPolicy";
import type { CreatorPrincipalType } from "../../../shared/provenance";
import { normalizePrincipal } from "../../../shared/principal";
import {
  DEFAULT_STATUS_IDS,
  createDefaultTaskGroups,
  createDefaultTaskPriorities,
  sortPrioritiesByValue,
  type Board,
  type BoardIndexEntry,
  type GroupDefinition,
  type List,
  type ReleaseDefinition,
  type Task,
  type TaskPriorityDefinition,
} from "../../../shared/models";
import { BOARD_FETCH_MAX_TASK_BODY_PREVIEW_CHARS } from "../../../shared/boardPayload";
import { slugify, uniqueSlug } from "../../../shared/slug";
import { getDb, withTransaction } from "../../db";
import {
  boardExists,
  normalizeBoardViewState,
  parseJsonColumn,
  statusWorkflowOrder,
} from "../system/helpers";
import {
  boardCliPolicyFromJoinColumns,
  insertDefaultBoardCliPolicy,
  insertFullBoardCliPolicy,
  upsertBoardCliPolicy,
} from "../system/cliPolicy";
import { patchBoardViewPrefs } from "./boardViewPrefs";
import { listReleasesForBoard } from "./releases";

function mapIndexRow(row: {
  id: number;
  slug: string;
  name: string;
  emoji: string | null;
  description: string | null;
  created_at: string;
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
}): BoardIndexEntry {
  const policy =
    boardCliPolicyFromJoinColumns(row) ?? EMPTY_BOARD_CLI_POLICY;
  return {
    boardId: row.id,
    slug: row.slug,
    name: row.name,
    emoji:
      row.emoji != null && String(row.emoji).trim() !== ""
        ? String(row.emoji).trim()
        : null,
    description: row.description ?? "",
    cliPolicy: policy,
    createdAt: row.created_at,
  };
}

const BOARD_INDEX_POLICY_COLS = `p.read_board, p.create_tasks, p.manage_cli_created_tasks, p.manage_any_tasks,
    p.create_lists, p.manage_cli_created_lists, p.manage_any_lists, p.manage_structure, p.delete_board, p.edit_board`;

type BoardRowWithPolicyJoin = {
  id: number;
  name: string;
  slug: string;
  emoji: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  default_task_group_id: number | null;
  deleted_group_fallback_id: number | null;
  default_release_id: number | null;
  auto_assign_release_ui: number | null;
  auto_assign_release_cli: number | null;
  created_by_principal: string | null;
  created_by_label: string | null;
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
};

export async function readBoardIndex(): Promise<BoardIndexEntry[]> {
  const db = getDb();
  const rows = db
    .query(
      `SELECT b.id, b.slug, b.name, b.emoji, b.description, b.created_at,
              ${BOARD_INDEX_POLICY_COLS}
       FROM board b
       LEFT JOIN board_cli_policy p ON p.board_id = b.id
       WHERE b.deleted_at IS NULL
       ORDER BY b.name COLLATE NOCASE`,
    )
    .all() as Parameters<typeof mapIndexRow>[0][];
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
        `SELECT b.id, b.slug, b.name, b.emoji, b.description, b.created_at,
                ${BOARD_INDEX_POLICY_COLS}
         FROM board b
         LEFT JOIN board_cli_policy p ON p.board_id = b.id
         WHERE b.id = ? AND b.deleted_at IS NULL`,
      )
      .get(Number(ref)) as Parameters<typeof mapIndexRow>[0] | null;
    if (row) return mapIndexRow(row);
  }
  const row2 = db
    .query(
      `SELECT b.id, b.slug, b.name, b.emoji, b.description, b.created_at,
              ${BOARD_INDEX_POLICY_COLS}
       FROM board b
       LEFT JOIN board_cli_policy p ON p.board_id = b.id
       WHERE b.slug = ? AND b.deleted_at IS NULL`,
    )
    .get(ref) as Parameters<typeof mapIndexRow>[0] | null;
  return row2 ? mapIndexRow(row2) : null;
}

/** Board index entry for policy checks even when the board is trashed (Trash API). */
export async function boardIndexEntryById(
  boardId: number,
): Promise<BoardIndexEntry | null> {
  const db = getDb();
  const row = db
    .query(
      `SELECT b.id, b.slug, b.name, b.emoji, b.description, b.created_at,
              ${BOARD_INDEX_POLICY_COLS}
       FROM board b
       LEFT JOIN board_cli_policy p ON p.board_id = b.id
       WHERE b.id = ?`,
    )
    .get(boardId) as Parameters<typeof mapIndexRow>[0] | null;
  return row ? mapIndexRow(row) : null;
}

export type LoadBoardOptions = {
  /**
   * When set, each task row uses `SUBSTR(t.body, 1, n)` so SQLite does not pull
   * multi-megabyte bodies into the process (board list / card preview path).
   */
  taskBodyMaxChars?: number;
};

/**
 * Full board document without task rows (avoids heavy task query for describe / future callers).
 */
export function loadBoardWithoutTasks(boardId: number): Omit<Board, "tasks"> | null {
  const db = getDb();
  const boardRow = db
    .query(
      `SELECT b.id, b.name, b.slug, b.emoji, b.description, b.created_at, b.updated_at,
              b.default_task_group_id, b.deleted_group_fallback_id,
              b.default_release_id, b.auto_assign_release_ui, b.auto_assign_release_cli,
              b.created_by_principal, b.created_by_label,
              ${BOARD_INDEX_POLICY_COLS}
       FROM board b
       LEFT JOIN board_cli_policy p ON p.board_id = b.id
       WHERE b.id = ? AND b.deleted_at IS NULL`,
    )
    .get(boardId) as BoardRowWithPolicyJoin | null;
  if (!boardRow) return null;

  const policyRow =
    boardCliPolicyFromJoinColumns(boardRow) ?? EMPTY_BOARD_CLI_POLICY;

  const createdPrincipal = normalizePrincipal(boardRow.created_by_principal);

  const prefs = db
    .query(
      "SELECT visible_statuses, status_band_weights, board_layout, board_color, background_image, show_counts, celebration_sounds_muted FROM board_view_prefs WHERE board_id = ?",
    )
    .get(boardId) as
    | {
        visible_statuses: string | null;
        status_band_weights: string | null;
        board_layout: string | null;
        board_color: string | null;
        background_image: string | null;
        show_counts: number | null;
        celebration_sounds_muted: number | null;
      }
    | null;

  const groupRows = db
    .query(
      "SELECT id, label, emoji, sort_order FROM task_group WHERE board_id = ? ORDER BY sort_order ASC, id ASC",
    )
    .all(boardId) as {
    id: number;
    label: string;
    emoji: string | null;
    sort_order: number;
  }[];

  const taskGroups: GroupDefinition[] = groupRows.map((g) => ({
    groupId: g.id,
    label: g.label,
    sortOrder: g.sort_order,
    emoji:
      g.emoji != null && String(g.emoji).trim() !== ""
        ? String(g.emoji).trim()
        : null,
  }));

  const groupIdSet = new Set(taskGroups.map((g) => g.groupId));
  const firstGroupId = taskGroups[0]?.groupId;
  let defaultTaskGroupId =
    boardRow.default_task_group_id ?? firstGroupId ?? 0;
  let deletedGroupFallbackId =
    boardRow.deleted_group_fallback_id ?? firstGroupId ?? 0;
  // Coerce invalid pointers (e.g. after a group delete) so the board always exposes valid ids.
  if (!groupIdSet.has(defaultTaskGroupId) && firstGroupId != null) {
    defaultTaskGroupId = firstGroupId;
  }
  if (!groupIdSet.has(deletedGroupFallbackId) && firstGroupId != null) {
    deletedGroupFallbackId = firstGroupId;
  }

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
      priorityId: p.id,
      value: p.value,
      label: p.label,
      color: p.color,
      isSystem: p.is_system !== 0,
    })),
  );

  const releases: ReleaseDefinition[] = listReleasesForBoard(boardId);
  const releaseIdSet = new Set(releases.map((r) => r.releaseId));
  let defaultReleaseId: number | null = boardRow.default_release_id ?? null;
  if (defaultReleaseId != null && !releaseIdSet.has(defaultReleaseId)) {
    defaultReleaseId = null;
  }
  const autoAssignReleaseOnCreateUi =
    Boolean(boardRow.auto_assign_release_ui) && defaultReleaseId != null;
  const autoAssignReleaseOnCreateCli =
    Boolean(boardRow.auto_assign_release_cli) && defaultReleaseId != null;

  const listRows = db
    .query(
      "SELECT id, name, sort_order, color, emoji, created_by_principal, created_by_label FROM list WHERE board_id = ? AND deleted_at IS NULL ORDER BY sort_order, id",
    )
    .all(boardId) as {
    id: number;
    name: string;
    sort_order: number;
    color: string | null;
    emoji: string | null;
    created_by_principal: string | null;
    created_by_label: string | null;
  }[];

  const lists: List[] = listRows.map((l) => ({
    listId: l.id,
    name: l.name,
    order: l.sort_order,
    color: l.color ?? undefined,
    emoji:
      l.emoji != null && String(l.emoji).trim() !== ""
        ? String(l.emoji).trim()
        : null,
    createdByPrincipal: normalizePrincipal(l.created_by_principal),
    createdByLabel: l.created_by_label,
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
    boardId: boardRow.id,
    slug: boardRow.slug,
    name: boardRow.name,
    emoji:
      boardRow.emoji != null && String(boardRow.emoji).trim() !== ""
        ? String(boardRow.emoji).trim()
        : null,
    description: boardRow.description ?? "",
    cliPolicy: policyRow,
    createdByPrincipal: createdPrincipal,
    createdByLabel: boardRow.created_by_label,
    backgroundImage: prefs?.background_image ?? undefined,
    boardColor: parseBoardColor(prefs?.board_color ?? undefined),
    taskGroups,
    defaultTaskGroupId,
    deletedGroupFallbackId,
    taskPriorities,
    releases,
    defaultReleaseId,
    autoAssignReleaseOnCreateUi,
    autoAssignReleaseOnCreateCli,
    visibleStatuses,
    statusBandWeights,
    boardLayout:
      prefs?.board_layout === "lanes" || prefs?.board_layout === "stacked"
        ? prefs.board_layout
        : undefined,
    // Default hidden when no prefs row; new boards insert `show_counts = 0`.
    showStats: prefs ? Boolean(prefs.show_counts) : false,
    muteCelebrationSounds: prefs
      ? Boolean(prefs.celebration_sounds_muted)
      : false,
    lists,
    createdAt: boardRow.created_at,
    updatedAt: boardRow.updated_at,
  };
}

function loadBoardTasks(
  boardId: number,
  releaseIdSet: Set<number>,
  options?: LoadBoardOptions,
): Task[] {
  const maxBody = options?.taskBodyMaxChars;
  const useSlimBody =
    maxBody != null && Number.isFinite(maxBody) && maxBody >= 0;
  const slimBodyLen = useSlimBody
    ? Math.min(
        BOARD_FETCH_MAX_TASK_BODY_PREVIEW_CHARS,
        Math.floor(maxBody as number),
      )
    : 0;
  const bodySql = useSlimBody ? "SUBSTR(t.body, 1, ?) AS body" : "t.body";
  const db = getDb();
  const taskRows = db
    .query(
      `SELECT t.id, t.list_id, t.group_id, t.priority_id, t.status_id, t.title, ${bodySql}, t.sort_order, t.color, t.emoji,
              t.release_id, t.created_at, t.updated_at, t.closed_at, t.created_by_principal, t.created_by_label
       FROM task t
       INNER JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
       WHERE t.board_id = ? AND t.deleted_at IS NULL AND l.deleted_at IS NULL
       ORDER BY t.list_id, t.status_id, t.sort_order, t.id`,
    )
    .all(...(useSlimBody ? [slimBodyLen, boardId] : [boardId])) as {
    id: number;
    list_id: number;
    group_id: number;
    priority_id: number;
    status_id: string;
    title: string;
    body: string;
    sort_order: number;
    color: string | null;
    emoji: string | null;
    release_id: number | null;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    created_by_principal: string | null;
    created_by_label: string | null;
  }[];

  return taskRows.map((t) => {
    const rawRid = t.release_id;
    const releaseId =
      rawRid != null && releaseIdSet.has(rawRid) ? rawRid : null;
    return {
      taskId: t.id,
      listId: t.list_id,
      title: t.title,
      body: t.body,
      groupId: t.group_id,
      priorityId: t.priority_id,
      status: t.status_id as Task["status"],
      order: t.sort_order,
      color: t.color ?? undefined,
      emoji:
        t.emoji != null && String(t.emoji).trim() !== ""
          ? String(t.emoji).trim()
          : null,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      closedAt: t.closed_at ?? undefined,
      createdByPrincipal: normalizePrincipal(t.created_by_principal),
      createdByLabel: t.created_by_label,
      releaseId,
    };
  });
}

export function loadBoard(boardId: number, options?: LoadBoardOptions): Board | null {
  // Split load: `loadBoardWithoutTasks` keeps describe and stats paths from scanning every task row.
  const shell = loadBoardWithoutTasks(boardId);
  if (!shell) return null;
  const releaseIdSet = new Set(shell.releases.map((r) => r.releaseId));
  const tasks = loadBoardTasks(boardId, releaseIdSet, options);
  return { ...shell, tasks };
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


export type CreateBoardOptions = {
  /** Persisted on the board row for CLI vs web provenance. */
  createdBy?: { principal: CreatorPrincipalType; label: string | null };
  /**
   * `web_default`: CLI locked out until a web user raises access (legacy `none`).
   * `cli_full`: CLI-created board bootstrap (full `board_cli_policy` row).
   */
  cliBootstrap?: "web_default" | "cli_full";
};

/** Create board row, default groups/priorities, default view prefs; returns full board. */
export async function createBoardWithDefaults(
  name: string,
  slug: string,
  emoji: string | null = null,
  description: string = "",
  options: CreateBoardOptions = {},
): Promise<Board> {
  const now = new Date().toISOString();
  const createdBy = options.createdBy ?? { principal: "web" as const, label: "User" };
  const bootstrap = options.cliBootstrap ?? "web_default";
  const boardId = withTransaction(getDb(), () => {
    const db = getDb();
    const r = db.run(
      `INSERT INTO board (name, slug, emoji, description, created_by_principal, created_by_label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        slug,
        emoji,
        description,
        createdBy.principal,
        createdBy.label,
        now,
        now,
      ],
    );
    const id = Number(r.lastInsertRowid);
    const groups = createDefaultTaskGroups();
    let ord = 0;
    for (const g of groups) {
      db.run(
        "INSERT INTO task_group (board_id, label, emoji, sort_order) VALUES (?, ?, ?, ?)",
        [id, g.label, null, ord],
      );
      ord += 1;
    }
    const firstG = db
      .query(
        "SELECT id FROM task_group WHERE board_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1",
      )
      .get(id) as { id: number } | null;
    if (firstG) {
      db.run(
        "UPDATE board SET default_task_group_id = ?, deleted_group_fallback_id = ? WHERE id = ?",
        [firstG.id, firstG.id, id],
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
          board_layout, board_color, background_image, show_counts, celebration_sounds_muted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        JSON.stringify([...DEFAULT_STATUS_IDS]),
        JSON.stringify([1, 1, 1]),
        "stacked",
        // Persist explicit default so DB matches client `DEFAULT_BOARD_COLOR` (neutral stone).
        DEFAULT_BOARD_COLOR,
        null,
        // Stats chips off by default (product: board-level T/O/C hidden until user opts in).
        0,
        0,
      ],
    );
    if (bootstrap === "cli_full") {
      insertFullBoardCliPolicy(id);
    } else {
      insertDefaultBoardCliPolicy(id);
    }
    return id;
  });
  const loaded = loadBoard(boardId);
  if (!loaded) throw new Error("Failed to load board after create");
  return loaded;
}

/**
 * Patch board metadata and/or theme color. Omitted keys leave those fields unchanged.
 * `boardColor` updates `board_view_prefs` (same as PATCH /view-prefs).
 */
export async function patchBoard(
  boardId: number,
  patch: {
    name?: string;
    emoji?: string | null;
    /** Granular policy (web-only); updates `board_cli_policy`. */
    cliPolicy?: BoardCliPolicy;
    description?: string | null;
    boardColor?: Board["boardColor"];
    defaultReleaseId?: number | null;
    autoAssignReleaseOnCreateUi?: boolean;
    autoAssignReleaseOnCreateCli?: boolean;
  },
): Promise<Board | null> {
  const hasName = "name" in patch;
  const hasEmoji = "emoji" in patch;
  const hasCliPolicy = "cliPolicy" in patch;
  const hasDesc = "description" in patch;
  const hasColor = "boardColor" in patch;
  const hasDefaultRel = "defaultReleaseId" in patch;
  const hasAutoUi = "autoAssignReleaseOnCreateUi" in patch;
  const hasAutoCli = "autoAssignReleaseOnCreateCli" in patch;
  const hasReleasePatch = hasDefaultRel || hasAutoUi || hasAutoCli;
  if (!hasName && !hasEmoji && !hasCliPolicy && !hasDesc && !hasColor && !hasReleasePatch)
    return null;

  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const existing = loadBoard(boardId);
  if (!existing) return null;

  let nextName = existing.name;
  if (hasName) {
    const trimmed = patch.name!.trim();
    if (!trimmed) return null;
    nextName = trimmed;
  }

  let nextSlug = existing.slug ?? "";
  if (hasName && nextName !== existing.name) {
    nextSlug = await generateSlug(nextName, String(boardId));
  }

  let nextEmoji = existing.emoji ?? null;
  if (hasEmoji) {
    nextEmoji = patch.emoji ?? null;
  }

  const normalizedPolicy = hasCliPolicy
    ? normalizeBoardCliPolicyImplied(patch.cliPolicy!)
    : null;

  const nextDesc = hasDesc
    ? (patch.description ?? "").trim()
    : (existing.description ?? "");

  const colorChanged =
    hasColor && (patch.boardColor ?? null) !== (existing.boardColor ?? null);

  const metaChanged =
    (hasName && nextName !== existing.name) ||
    (hasEmoji && (nextEmoji ?? null) !== (existing.emoji ?? null)) ||
    (hasCliPolicy && normalizedPolicy !== null) ||
    (hasDesc && nextDesc !== (existing.description ?? ""));

  let nextDefaultReleaseId = existing.defaultReleaseId;
  if (hasDefaultRel) {
    const v = patch.defaultReleaseId;
    if (v != null) {
      if (!existing.releases.some((r) => r.releaseId === v)) return null;
      nextDefaultReleaseId = v;
    } else {
      nextDefaultReleaseId = null;
    }
  }

  let nextAutoUi = existing.autoAssignReleaseOnCreateUi;
  let nextAutoCli = existing.autoAssignReleaseOnCreateCli;
  if (hasAutoUi) nextAutoUi = Boolean(patch.autoAssignReleaseOnCreateUi);
  if (hasAutoCli) nextAutoCli = Boolean(patch.autoAssignReleaseOnCreateCli);
  // Auto-assign requires a default release (product rule: toggles off when no default).
  if (nextDefaultReleaseId == null) {
    nextAutoUi = false;
    nextAutoCli = false;
  }

  const releaseChanged =
    hasReleasePatch &&
    (nextDefaultReleaseId !== existing.defaultReleaseId ||
      nextAutoUi !== existing.autoAssignReleaseOnCreateUi ||
      nextAutoCli !== existing.autoAssignReleaseOnCreateCli);

  if (!metaChanged && !colorChanged && !releaseChanged) return existing;

  const now = new Date().toISOString();
  if (metaChanged || releaseChanged) {
    withTransaction(db, () => {
      if (metaChanged) {
        db.run(
          "UPDATE board SET name = ?, slug = ?, emoji = ?, description = ?, updated_at = ? WHERE id = ?",
          [nextName, nextSlug, nextEmoji, nextDesc, now, boardId],
        );
        if (hasCliPolicy && normalizedPolicy) {
          upsertBoardCliPolicy(boardId, normalizedPolicy);
        }
      }
      if (releaseChanged) {
        db.run(
          `UPDATE board SET default_release_id = ?, auto_assign_release_ui = ?, auto_assign_release_cli = ?, updated_at = ?
           WHERE id = ?`,
          [
            nextDefaultReleaseId,
            nextAutoUi ? 1 : 0,
            nextAutoCli ? 1 : 0,
            now,
            boardId,
          ],
        );
      }
    });
  }

  if (colorChanged) {
    return patchBoardViewPrefs(boardId, { boardColor: patch.boardColor });
  }
  return loadBoard(boardId);
}
