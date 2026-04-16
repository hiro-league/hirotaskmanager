import type { Database } from "bun:sqlite";
import { NONE_TASK_PRIORITY_VALUE, type Board, type TaskPriorityDefinition } from "../../../shared/models";
import type { PatchBoardTaskGroupConfigInput } from "../../../shared/taskGroupConfig";
import { parseEmojiField } from "../../../shared/emojiField";
import { getDb, withTransaction } from "../../db";
import { boardExists, normalizeBoardViewState, parseJsonColumn } from "../system/helpers";
import { loadBoard } from "./board";

/** Sync priorities while preserving built-in rows and clearing deleted assignments. */
function applyTaskPriorityChanges(
  db: Database,
  boardId: number,
  taskPriorities: TaskPriorityDefinition[],
): void {
  const normalized = taskPriorities.map((priority) => ({
    priorityId: priority.priorityId,
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
    const incoming = normalized.find((priority) => priority.priorityId === row.id);
    if (!incoming) {
      throw new Error("Built-in priorities cannot be deleted");
    }
    if (incoming.value !== row.value) {
      throw new Error("Built-in priorities cannot change numeric value");
    }
  }

  const keptPriorityIds = new Set<number>();
  for (const priority of normalized) {
    const existing = existingById.get(priority.priorityId);
    if (existing) {
      if (existing.is_system !== 0) {
        db.run(
          "UPDATE task_priority SET label = ?, color = ? WHERE id = ?",
          [priority.label, priority.color, priority.priorityId],
        );
      } else {
        db.run(
          "UPDATE task_priority SET value = ?, label = ?, color = ? WHERE id = ?",
          [priority.value, priority.label, priority.color, priority.priorityId],
        );
      }
      keptPriorityIds.add(priority.priorityId);
      continue;
    }

    const result = db.run(
      "INSERT INTO task_priority (board_id, value, label, color, is_system) VALUES (?, ?, ?, ?, ?)",
      [boardId, priority.value, priority.label, priority.color, 0],
    );
    keptPriorityIds.add(Number(result.lastInsertRowid));
  }

  // Every board must keep the system `none` slot so tasks always have a valid `priority_id`.
  const noneRow = db
    .query(
      "SELECT id FROM task_priority WHERE board_id = ? AND value = ?",
    )
    .get(boardId, NONE_TASK_PRIORITY_VALUE) as { id: number } | null;
  if (!noneRow) {
    throw new Error("Board missing builtin none priority");
  }
  for (const row of existingRows) {
    if (row.is_system !== 0 || keptPriorityIds.has(row.id)) continue;
    // Reassign tasks off deleted custom priorities to builtin `none` before removing the row.
    db.run("UPDATE task SET priority_id = ? WHERE priority_id = ?", [
      noneRow.id,
      row.id,
    ]);
    db.run("DELETE FROM task_priority WHERE id = ?", [row.id]);
  }
}

function resolveTaskGroupUpdateEmoji(
  db: Database,
  boardId: number,
  groupId: number,
  emoji: string | null | undefined,
): string | null {
  if (emoji !== undefined) return emoji;
  const row = db
    .query("SELECT emoji FROM task_group WHERE id = ? AND board_id = ?")
    .get(groupId, boardId) as { emoji: string | null } | null;
  const raw = row?.emoji;
  if (raw != null && String(raw).trim() !== "") {
    return String(raw).trim();
  }
  return null;
}

/**
 * Explicit task group create/update/delete (Phase 2). Replaces legacy replacement-array semantics.
 */
function applyTaskGroupConfig(
  db: Database,
  boardId: number,
  input: PatchBoardTaskGroupConfigInput,
): void {
  const existingRows = db
    .query("SELECT id FROM task_group WHERE board_id = ?")
    .all(boardId) as { id: number }[];
  const existingIds = new Set(existingRows.map((row) => row.id));

  const deleteIds = input.deletes.map((item) => item.groupId);
  const deleteSet = new Set(deleteIds);
  if (deleteSet.size !== deleteIds.length) {
    throw new Error("Duplicate delete groupId");
  }

  const updateIds = input.updates.map((item) => item.groupId);
  const updateSet = new Set(updateIds);
  if (updateSet.size !== updateIds.length) {
    throw new Error("Duplicate update groupId");
  }

  for (const id of updateSet) {
    if (deleteSet.has(id)) {
      throw new Error("Cannot update and delete the same task group");
    }
  }

  const createClientIds = input.creates.map((item) => item.clientId);
  const clientIdSet = new Set(createClientIds);
  if (clientIdSet.size !== createClientIds.length) {
    throw new Error("Duplicate create clientId");
  }

  for (const update of input.updates) {
    if (!existingIds.has(update.groupId)) {
      throw new Error(`Update references unknown task group id ${update.groupId}`);
    }
    if (deleteSet.has(update.groupId)) {
      throw new Error(`Cannot update deleted task group id ${update.groupId}`);
    }
  }

  for (const deletion of input.deletes) {
    if (!existingIds.has(deletion.groupId)) {
      throw new Error(`Delete references unknown task group id ${deletion.groupId}`);
    }
  }

  const clientIdToNewId = new Map<string, number>();
  const newIds: number[] = [];

  for (const create of input.creates) {
    let emoji: string | null = null;
    if (create.emoji !== undefined && create.emoji !== null) {
      const parsed = parseEmojiField(create.emoji);
      if (!parsed.ok) throw new Error(parsed.error);
      emoji = parsed.value;
    }
    const result = db.run(
      "INSERT INTO task_group (board_id, label, emoji, sort_order) VALUES (?, ?, ?, ?)",
      [boardId, create.label, emoji, create.sortOrder],
    );
    const newId = Number(result.lastInsertRowid);
    clientIdToNewId.set(create.clientId, newId);
    newIds.push(newId);
  }

  const surviving = new Set<number>();
  for (const id of existingIds) {
    if (!deleteSet.has(id)) surviving.add(id);
  }
  for (const id of newIds) surviving.add(id);

  let resolvedDefault = input.defaultTaskGroupId;
  if (input.defaultTaskGroupClientId) {
    const mapped = clientIdToNewId.get(input.defaultTaskGroupClientId);
    if (mapped === undefined) {
      throw new Error("defaultTaskGroupClientId does not match any create");
    }
    resolvedDefault = mapped;
  }
  let resolvedFallback = input.deletedGroupFallbackId;
  if (input.deletedGroupFallbackClientId) {
    const mapped = clientIdToNewId.get(input.deletedGroupFallbackClientId);
    if (mapped === undefined) {
      throw new Error("deletedGroupFallbackClientId does not match any create");
    }
    resolvedFallback = mapped;
  }
  if (resolvedDefault === undefined || resolvedFallback === undefined) {
    throw new Error("Missing default task group or fallback resolution");
  }
  if (!surviving.has(resolvedDefault)) {
    throw new Error("defaultTaskGroupId must reference a surviving task group");
  }
  if (!surviving.has(resolvedFallback)) {
    throw new Error("deletedGroupFallbackId must reference a surviving task group");
  }
  if (surviving.size < 1) {
    throw new Error("At least one task group must remain");
  }

  for (const update of input.updates) {
    const emoji = resolveTaskGroupUpdateEmoji(
      db,
      boardId,
      update.groupId,
      update.emoji,
    );
    db.run(
      "UPDATE task_group SET label = ?, emoji = ?, sort_order = ? WHERE id = ? AND board_id = ?",
      [update.label, emoji, update.sortOrder, update.groupId, boardId],
    );
  }

  for (const deletion of input.deletes) {
    let target: number;
    if (deletion.moveTasksToClientId) {
      const mapped = clientIdToNewId.get(deletion.moveTasksToClientId);
      if (mapped === undefined) {
        throw new Error("moveTasksToClientId does not match any create");
      }
      target = mapped;
    } else {
      target = deletion.moveTasksToGroupId ?? resolvedFallback;
    }
    if (!surviving.has(target)) {
      throw new Error("Task move target must be a surviving task group");
    }
    if (deleteSet.has(target)) {
      throw new Error("Cannot move tasks to a deleted task group");
    }
    if (target === deletion.groupId) {
      throw new Error("Cannot move tasks to the group being deleted");
    }
    db.run("UPDATE task SET group_id = ? WHERE group_id = ? AND board_id = ?", [
      target,
      deletion.groupId,
      boardId,
    ]);
    db.run("DELETE FROM task_group WHERE id = ? AND board_id = ?", [
      deletion.groupId,
      boardId,
    ]);
  }

  db.run(
    "UPDATE board SET default_task_group_id = ?, deleted_group_fallback_id = ?, updated_at = ? WHERE id = ?",
    [
      resolvedDefault,
      resolvedFallback,
      new Date().toISOString(),
      boardId,
    ],
  );
}

export function patchBoardViewPrefs(
  boardId: number,
  patch: {
    visibleStatuses?: string[];
    statusBandWeights?: number[];
    boardLayout?: Board["boardLayout"];
    boardColor?: Board["boardColor"];
    backgroundImage?: string | null;
    showStats?: boolean;
    muteCelebrationSounds?: boolean;
  },
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;

  const row = db
    .query(
      "SELECT visible_statuses, status_band_weights, board_layout, board_color, background_image, show_counts, celebration_sounds_muted FROM board_view_prefs WHERE board_id = ?",
    )
    .get(boardId) as {
    visible_statuses: string | null;
    status_band_weights: string | null;
    board_layout: string | null;
    board_color: string | null;
    background_image: string | null;
    show_counts: number | null;
    celebration_sounds_muted: number | null;
  } | null;

  if (!row) return null;

  const currentVisible = parseJsonColumn<string[]>(row.visible_statuses, []);
  const currentWeights = parseJsonColumn<number[] | undefined>(
    row.status_band_weights,
    undefined,
  );

  let nextVisible = patch.visibleStatuses ?? currentVisible;
  let nextWeights = patch.statusBandWeights ?? currentWeights;
  const layout =
    patch.boardLayout !== undefined
      ? patch.boardLayout
      : row.board_layout === "lanes" || row.board_layout === "stacked"
        ? row.board_layout
        : undefined;
  const boardColor =
    patch.boardColor !== undefined ? patch.boardColor : row.board_color;
  const backgroundImage =
    patch.backgroundImage !== undefined
      ? patch.backgroundImage
      : row.background_image;
  const showStats =
    patch.showStats !== undefined ? patch.showStats : Boolean(row.show_counts);
  const muteCelebrationSounds =
    patch.muteCelebrationSounds !== undefined
      ? patch.muteCelebrationSounds
      : Boolean(row.celebration_sounds_muted);

  const view = normalizeBoardViewState(db, nextVisible, nextWeights);
  nextVisible = view.visibleStatuses;
  nextWeights = view.statusBandWeights;

  const now = new Date().toISOString();
  withTransaction(db, () => {
    db.run(
      `INSERT OR REPLACE INTO board_view_prefs
         (board_id, visible_statuses, status_band_weights,
          board_layout, board_color, background_image, show_counts, celebration_sounds_muted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        boardId,
        JSON.stringify(nextVisible),
        nextWeights ? JSON.stringify(nextWeights) : null,
        layout ?? null,
        boardColor ?? null,
        backgroundImage ?? null,
        showStats ? 1 : 0,
        muteCelebrationSounds ? 1 : 0,
      ],
    );
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });

  return loadBoard(boardId);
}

export function patchBoardTaskGroupConfig(
  boardId: number,
  input: PatchBoardTaskGroupConfigInput,
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  withTransaction(db, () => {
    applyTaskGroupConfig(db, boardId, input);
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
