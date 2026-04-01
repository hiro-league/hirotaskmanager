import type { Data, UniqueIdentifier } from "@dnd-kit/abstract";

export const BOARD_COLUMN_DND_TYPE = "board-column";
export const BOARD_TASK_DND_TYPE = "board-task";
export const BOARD_TASK_CONTAINER_DND_TYPE = "board-task-container";
export const BOARD_COLUMNS_GROUP = "board-columns";

export type BoardDndLayout = "stacked" | "lanes";

export interface BoardColumnDragData extends Data {
  kind: "column";
  listId: number;
}

export interface BoardTaskDragData extends Data {
  kind: "task";
  taskId: number;
  containerId: string;
}

export interface BoardTaskContainerData extends Data {
  kind: "task-container";
  containerId: string;
  layout: BoardDndLayout;
  listId: number;
  status?: string;
}

export type BoardDndData =
  | BoardColumnDragData
  | BoardTaskDragData
  | BoardTaskContainerData;

// Phase 1 migration helper: keep the new React-first drag payload shape
// centralized so later file-by-file migration does not duplicate source/target
// parsing logic across stacked and lanes implementations.
export function boardColumnDragData(listId: number): BoardColumnDragData {
  return {
    kind: "column",
    listId,
  };
}

export function boardTaskDragData(
  taskId: number,
  containerId: string,
): BoardTaskDragData {
  return {
    kind: "task",
    taskId,
    containerId,
  };
}

export function boardTaskContainerData(
  containerId: string,
  layout: BoardDndLayout,
  listId: number,
  status?: string,
): BoardTaskContainerData {
  return {
    kind: "task-container",
    containerId,
    layout,
    listId,
    ...(status ? { status } : {}),
  };
}

export function isBoardColumnDragData(
  data: Data | null | undefined,
): data is BoardColumnDragData {
  return data?.kind === "column" && typeof data.listId === "number";
}

export function isBoardTaskDragData(
  data: Data | null | undefined,
): data is BoardTaskDragData {
  return (
    data?.kind === "task" &&
    typeof data.taskId === "number" &&
    typeof data.containerId === "string"
  );
}

export function isBoardTaskContainerData(
  data: Data | null | undefined,
): data is BoardTaskContainerData {
  return (
    data?.kind === "task-container" &&
    typeof data.containerId === "string" &&
    typeof data.listId === "number" &&
    (data.layout === "stacked" || data.layout === "lanes")
  );
}

export function normalizeDndId(id: UniqueIdentifier | null | undefined): string | null {
  return id == null ? null : String(id);
}
