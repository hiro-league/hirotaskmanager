import { Hono } from "hono";
import type { Board, TaskPriorityDefinition } from "../../../shared/models";
import { parsePatchBoardTaskGroupConfigBody } from "../../../shared/taskGroupConfig";
import type { AppBindings } from "../../auth";
import {
  cliEditBoardMetadataError,
  cliManageStructureError,
} from "../../cliPolicyGuard";
import { publishBoardChanged } from "../../events";
import {
  recordBoardTaskGroups,
  recordBoardTaskPriorities,
} from "../../notifications/recordBoard";
import {
  patchBoardTaskGroupConfig,
  patchBoardTaskPriorities,
  patchBoardViewPrefs,
} from "../../storage";
import { requireBoardEntry } from "./shared";

export const boardSettingsRoute = new Hono<AppBindings>();

boardSettingsRoute.patch("/:id/view-prefs", async (c) => {
  const entry = requireBoardEntry(c);
  const blocked = cliEditBoardMetadataError(c, entry.boardId);
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const patch: Parameters<typeof patchBoardViewPrefs>[1] = {};
  if (Array.isArray(body.visibleStatuses)) {
    patch.visibleStatuses = body.visibleStatuses as string[];
  }
  if (Array.isArray(body.statusBandWeights)) {
    patch.statusBandWeights = body.statusBandWeights as number[];
  }
  if (body.boardLayout === "lanes" || body.boardLayout === "stacked") {
    patch.boardLayout = body.boardLayout;
  }
  if (typeof body.boardColor === "string" || body.boardColor === null) {
    patch.boardColor = body.boardColor as Board["boardColor"];
  }
  if (typeof body.backgroundImage === "string" || body.backgroundImage === null) {
    patch.backgroundImage = body.backgroundImage as string | null;
  }
  // Prefer `showStats`; accept legacy `showCounts` for older clients.
  if (typeof body.showStats === "boolean") {
    patch.showStats = body.showStats;
  } else if (typeof (body as { showCounts?: unknown }).showCounts === "boolean") {
    patch.showStats = (body as { showCounts: boolean }).showCounts;
  }
  if (typeof body.muteCelebrationSounds === "boolean") {
    patch.muteCelebrationSounds = body.muteCelebrationSounds;
  }
  const saved = patchBoardViewPrefs(entry.boardId, patch);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  publishBoardChanged(entry.boardId, saved.updatedAt);
  // View preference updates do not emit notification rows (Phase 4).
  return c.json(saved);
});

boardSettingsRoute.patch("/:id/groups", async (c) => {
  const entry = requireBoardEntry(c);
  const blocked = cliManageStructureError(c, entry.boardId);
  if (blocked) return blocked;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = parsePatchBoardTaskGroupConfigBody(body);
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, 400);
  }
  try {
    const saved = patchBoardTaskGroupConfig(entry.boardId, parsed.value);
    if (!saved) return c.json({ error: "Board not found" }, 404);
    publishBoardChanged(entry.boardId, saved.updatedAt);
    recordBoardTaskGroups(c, entry, saved);
    return c.json(saved);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid task groups";
    return c.json({ error: msg }, 400);
  }
});

boardSettingsRoute.patch("/:id/priorities", async (c) => {
  const entry = requireBoardEntry(c);
  const blocked = cliManageStructureError(c, entry.boardId);
  if (blocked) return blocked;
  let body: { taskPriorities?: unknown };
  try {
    body = (await c.req.json()) as { taskPriorities?: unknown };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!Array.isArray(body.taskPriorities)) {
    return c.json({ error: "taskPriorities array required" }, 400);
  }
  const taskPriorities: TaskPriorityDefinition[] = [];
  for (const item of body.taskPriorities) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const label = typeof rec.label === "string" ? rec.label.trim() : "";
    const color = typeof rec.color === "string" ? rec.color.trim() : "";
    const value =
      typeof rec.value === "number" && Number.isFinite(rec.value)
        ? rec.value
        : Number.NaN;
    // Client PATCH body uses `priorityId` (aligned with {@link TaskPriorityDefinition}).
    const priorityId =
      typeof rec.priorityId === "number" && Number.isFinite(rec.priorityId)
        ? rec.priorityId
        : 0;
    const isSystem = Boolean(rec.isSystem);
    taskPriorities.push({ priorityId, value, label, color, isSystem });
  }
  if (taskPriorities.length === 0) {
    return c.json({ error: "At least one task priority required" }, 400);
  }
  try {
    const saved = patchBoardTaskPriorities(entry.boardId, taskPriorities);
    if (!saved) return c.json({ error: "Board not found" }, 404);
    publishBoardChanged(entry.boardId, saved.updatedAt);
    recordBoardTaskPriorities(c, entry, saved);
    return c.json(saved);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid task priorities";
    return c.json({ error: msg }, 400);
  }
});
