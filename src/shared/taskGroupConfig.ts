import { parseEmojiField } from "./emojiField";
import type { Board, GroupDefinition } from "./models";

/** New task group row in `PATCH /api/boards/:id/groups` (Phase 2 explicit ops). */
export type TaskGroupCreateInput = {
  clientId: string;
  label: string;
  emoji?: string | null;
  sortOrder: number;
};

/** Existing task group row update. */
export type TaskGroupUpdateInput = {
  id: number;
  label: string;
  emoji?: string | null;
  sortOrder: number;
};

/** Delete a task group; tasks move to `moveTasksToGroupId` or a create row via `moveTasksToClientId`. */
export type TaskGroupDeleteInput = {
  id: number;
  moveTasksToGroupId?: number;
  /** After creates are inserted, resolve to `task_group.id` for the move target. */
  moveTasksToClientId?: string;
};

/**
 * Explicit task group editor save (replaces legacy `taskGroups` replacement-array payloads).
 * Use `defaultTaskGroupClientId` / `deletedGroupFallbackClientId` when defaults point at a row
 * created in the same request (server ids are not known client-side yet).
 */
export type PatchBoardTaskGroupConfigInput = {
  creates: TaskGroupCreateInput[];
  updates: TaskGroupUpdateInput[];
  deletes: TaskGroupDeleteInput[];
  /** Required unless `defaultTaskGroupClientId` is set. */
  defaultTaskGroupId?: number;
  /** Required unless `deletedGroupFallbackClientId` is set. */
  deletedGroupFallbackId?: number;
  defaultTaskGroupClientId?: string;
  deletedGroupFallbackClientId?: string;
};

function isFiniteInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Math.floor(n) === n;
}

function parseEmojiValue(
  raw: unknown,
): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw === "string") {
    const p = parseEmojiField(raw);
    return p.ok ? { ok: true, value: p.value } : { ok: false, error: p.error };
  }
  return { ok: false, error: "Invalid emoji" };
}

/**
 * Parse and validate `PATCH /api/boards/:id/groups` JSON body for Phase 2 explicit operations.
 */
export function parsePatchBoardTaskGroupConfigBody(
  body: unknown,
):
  | { ok: true; value: PatchBoardTaskGroupConfigInput }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "JSON body must be an object" };
  }
  const rec = body as Record<string, unknown>;

  if ("taskGroups" in rec && Array.isArray(rec.taskGroups)) {
    return {
      ok: false,
      error:
        "Legacy taskGroups array is no longer supported; use creates, updates, and deletes",
    };
  }

  if (!Array.isArray(rec.creates)) {
    return { ok: false, error: "creates array required" };
  }
  if (!Array.isArray(rec.updates)) {
    return { ok: false, error: "updates array required" };
  }
  if (!Array.isArray(rec.deletes)) {
    return { ok: false, error: "deletes array required" };
  }

  const creates: TaskGroupCreateInput[] = [];
  for (const item of rec.creates) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Invalid create entry" };
    }
    const o = item as Record<string, unknown>;
    const clientId =
      typeof o.clientId === "string" ? o.clientId.trim() : "";
    if (!clientId) {
      return { ok: false, error: "Each create requires a non-empty clientId" };
    }
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label) {
      return { ok: false, error: "Each create requires a non-empty label" };
    }
    if (!isFiniteInt(o.sortOrder)) {
      return { ok: false, error: "Each create requires a finite integer sortOrder" };
    }
    const em = parseEmojiValue(o.emoji);
    if (!em.ok) return em;
    creates.push({
      clientId,
      label,
      emoji: em.value,
      sortOrder: o.sortOrder,
    });
  }

  const updates: TaskGroupUpdateInput[] = [];
  for (const item of rec.updates) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Invalid update entry" };
    }
    const o = item as Record<string, unknown>;
    if (!isFiniteInt(o.id) || (o.id as number) <= 0) {
      return { ok: false, error: "Each update requires a positive integer id" };
    }
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label) {
      return { ok: false, error: "Each update requires a non-empty label" };
    }
    if (!isFiniteInt(o.sortOrder)) {
      return { ok: false, error: "Each update requires a finite integer sortOrder" };
    }
    const em = parseEmojiValue(o.emoji);
    if (!em.ok) return em;
    updates.push({
      id: o.id,
      label,
      emoji: em.value,
      sortOrder: o.sortOrder,
    });
  }

  const deletes: TaskGroupDeleteInput[] = [];
  for (const item of rec.deletes) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Invalid delete entry" };
    }
    const o = item as Record<string, unknown>;
    if (!isFiniteInt(o.id) || (o.id as number) <= 0) {
      return { ok: false, error: "Each delete requires a positive integer id" };
    }
    let moveTasksToGroupId: number | undefined;
    if ("moveTasksToGroupId" in o) {
      const m = o.moveTasksToGroupId;
      if (m === undefined || m === null) {
        moveTasksToGroupId = undefined;
      } else if (isFiniteInt(m) && m > 0) {
        moveTasksToGroupId = m;
      } else {
        return { ok: false, error: "Invalid moveTasksToGroupId" };
      }
    }
    let moveTasksToClientId: string | undefined;
    if ("moveTasksToClientId" in o && o.moveTasksToClientId !== undefined) {
      if (typeof o.moveTasksToClientId !== "string") {
        return { ok: false, error: "Invalid moveTasksToClientId" };
      }
      const t = o.moveTasksToClientId.trim();
      if (!t) {
        return { ok: false, error: "moveTasksToClientId must be non-empty when set" };
      }
      moveTasksToClientId = t;
    }
    if (
      moveTasksToGroupId !== undefined &&
      moveTasksToClientId !== undefined
    ) {
      return {
        ok: false,
        error: "Use either moveTasksToGroupId or moveTasksToClientId per delete, not both",
      };
    }
    deletes.push({ id: o.id, moveTasksToGroupId, moveTasksToClientId });
  }

  const defaultTaskGroupClientId =
    typeof rec.defaultTaskGroupClientId === "string"
      ? rec.defaultTaskGroupClientId.trim()
      : undefined;
  const deletedGroupFallbackClientId =
    typeof rec.deletedGroupFallbackClientId === "string"
      ? rec.deletedGroupFallbackClientId.trim()
      : undefined;

  let defaultTaskGroupId: number | undefined;
  if ("defaultTaskGroupId" in rec && rec.defaultTaskGroupId !== undefined) {
    const d = rec.defaultTaskGroupId;
    if (!isFiniteInt(d) || d <= 0) {
      return { ok: false, error: "defaultTaskGroupId must be a positive integer" };
    }
    defaultTaskGroupId = d;
  }

  let deletedGroupFallbackId: number | undefined;
  if ("deletedGroupFallbackId" in rec && rec.deletedGroupFallbackId !== undefined) {
    const d = rec.deletedGroupFallbackId;
    if (!isFiniteInt(d) || d <= 0) {
      return {
        ok: false,
        error: "deletedGroupFallbackId must be a positive integer",
      };
    }
    deletedGroupFallbackId = d;
  }

  if (!defaultTaskGroupClientId && defaultTaskGroupId === undefined) {
    return {
      ok: false,
      error: "defaultTaskGroupId or defaultTaskGroupClientId is required",
    };
  }
  if (!deletedGroupFallbackClientId && deletedGroupFallbackId === undefined) {
    return {
      ok: false,
      error: "deletedGroupFallbackId or deletedGroupFallbackClientId is required",
    };
  }

  return {
    ok: true,
    value: {
      creates,
      updates,
      deletes,
      defaultTaskGroupId,
      deletedGroupFallbackId,
      defaultTaskGroupClientId: defaultTaskGroupClientId || undefined,
      deletedGroupFallbackClientId: deletedGroupFallbackClientId || undefined,
    },
  };
}

export type TaskGroupEditorRow = GroupDefinition & {
  clientId: string;
};

/** Surviving group reference for editor defaults and delete move targets (id = persisted row, clientId = new row). */
export type TaskGroupSelection =
  | { kind: "id"; id: number }
  | { kind: "clientId"; clientId: string };

/**
 * Per removed baseline group id: where tasks go (`null` = omit move fields; server uses board fallback).
 * Only allowed when that group has no tasks on the board; otherwise caller must supply a selection.
 * `defaultGroup` is the starred row in the editor; the same selection sets `deletedGroupFallbackId` (no separate fallback UI).
 */
export type BuildTaskGroupEditorPatchInput = {
  defaultGroup: TaskGroupSelection;
  deleteMoves: Map<number, TaskGroupSelection | null>;
};

function selectionToDefaultApi(
  s: TaskGroupSelection,
): Pick<
  PatchBoardTaskGroupConfigInput,
  "defaultTaskGroupId" | "defaultTaskGroupClientId"
> {
  if (s.kind === "id") return { defaultTaskGroupId: s.id };
  return { defaultTaskGroupClientId: s.clientId };
}

function selectionToFallbackApi(
  s: TaskGroupSelection,
): Pick<
  PatchBoardTaskGroupConfigInput,
  "deletedGroupFallbackId" | "deletedGroupFallbackClientId"
> {
  if (s.kind === "id") return { deletedGroupFallbackId: s.id };
  return { deletedGroupFallbackClientId: s.clientId };
}

function selectionToDeleteMove(
  s: TaskGroupSelection,
): Pick<TaskGroupDeleteInput, "moveTasksToGroupId" | "moveTasksToClientId"> {
  if (s.kind === "id") return { moveTasksToGroupId: s.id };
  return { moveTasksToClientId: s.clientId };
}

function selectionMatchesRow(
  trimmed: TaskGroupEditorRow[],
  s: TaskGroupSelection,
): boolean {
  if (s.kind === "clientId") {
    return trimmed.some((r) => r.clientId === s.clientId);
  }
  return trimmed.some((r) => r.id === s.id);
}

/**
 * Build explicit `PATCH /api/boards/:id/groups` payload from the task group editor draft state.
 * Default and deleted-group fallback both use `defaultGroup` (star in the editor).
 */
export function buildPatchBoardTaskGroupConfigFromEditor(
  board: Board,
  rows: TaskGroupEditorRow[],
  patchInput: BuildTaskGroupEditorPatchInput,
): PatchBoardTaskGroupConfigInput {
  const baselineIds = new Set(board.taskGroups.map((g) => g.id));
  const trimmed = rows
    .map((r) => ({
      ...r,
      label: r.label.trim(),
      emoji: r.emoji ?? null,
    }))
    .filter((r) => r.label.length > 0)
    .map((r, i) => ({ ...r, sortOrder: i }));

  if (trimmed.length === 0) {
    throw new Error("At least one task group is required");
  }

  if (!selectionMatchesRow(trimmed, patchInput.defaultGroup)) {
    throw new Error(
      "Default group must reference a surviving group in the editor",
    );
  }

  const currentIds = new Set(trimmed.map((r) => r.id));
  const removedIds = [...baselineIds].filter((id) => !currentIds.has(id));

  for (const id of removedIds) {
    const taskCount = board.tasks.filter((t) => t.groupId === id).length;
    const mv = patchInput.deleteMoves.get(id) ?? null;
    if (taskCount > 0 && mv == null) {
      throw new Error(
        "Choose where to move tasks for each removed group that still has tasks",
      );
    }
    if (mv != null) {
      if (!selectionMatchesRow(trimmed, mv)) {
        throw new Error("Move-to target must be a surviving group in the editor");
      }
      if (mv.kind === "id" && mv.id === id) {
        throw new Error("Cannot move tasks to the group being removed");
      }
    }
  }

  const deletes: TaskGroupDeleteInput[] = removedIds.map((id) => {
    const mv = patchInput.deleteMoves.get(id) ?? null;
    if (mv == null) return { id };
    return { id, ...selectionToDeleteMove(mv) };
  });

  const creates = trimmed
    .filter((r) => !baselineIds.has(r.id))
    .map((r) => ({
      clientId: r.clientId,
      label: r.label,
      emoji: r.emoji,
      sortOrder: r.sortOrder,
    }));

  const updates = trimmed
    .filter((r) => baselineIds.has(r.id))
    .map((r) => ({
      id: r.id,
      label: r.label,
      emoji: r.emoji,
      sortOrder: r.sortOrder,
    }));

  return {
    creates,
    updates,
    deletes,
    ...selectionToDefaultApi(patchInput.defaultGroup),
    ...selectionToFallbackApi(patchInput.defaultGroup),
  };
}

/** Encode a draft row for `<select value>` (stable across new vs existing rows). */
export function encodeTaskGroupRowRef(
  row: TaskGroupEditorRow,
  baselineIds: Set<number>,
): string {
  if (row.id > 0 && baselineIds.has(row.id)) {
    return `id:${row.id}`;
  }
  return `cid:${row.clientId}`;
}

/** Decode `encodeTaskGroupRowRef` output. */
export function decodeTaskGroupRowRef(value: string): TaskGroupSelection {
  if (value.startsWith("id:")) {
    return { kind: "id", id: Number(value.slice(3)) };
  }
  if (value.startsWith("cid:")) {
    return { kind: "clientId", clientId: value.slice(4) };
  }
  throw new Error("Invalid task group row ref");
}

/** Visible label for a row in selects and summaries. */
export function formatTaskGroupRowLabel(row: Pick<TaskGroupEditorRow, "label" | "id">): string {
  const t = row.label.trim();
  return t.length > 0 ? t : `Group ${row.id}`;
}
