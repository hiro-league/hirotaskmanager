import type { Board, List, Task } from "../../shared/models";

/** Compact shapes for Phase 3 write command stdout (see docs/ai-cli.md). */
export type WriteBoardEntity = {
  type: "board";
  id: number;
  slug: string;
  name: string;
  emoji: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WriteListEntity = {
  type: "list";
  id: number;
  name: string;
  order: number;
  color?: string;
  emoji: string | null;
};

export type WriteTaskEntity = {
  type: "task";
  id: number;
  listId: number;
  groupId: number;
  priorityId: number | null | undefined;
  status: string;
  title: string;
  body: string;
  color: string | null | undefined;
  emoji: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null | undefined;
};

export type WriteEntity = WriteBoardEntity | WriteListEntity | WriteTaskEntity;

export type WriteSuccessEnvelope = {
  ok: true;
  boardId: number;
  boardSlug: string;
  boardUpdatedAt: string;
  entity: WriteEntity;
};

export function compactBoardEntity(board: Board): WriteBoardEntity {
  return {
    type: "board",
    id: board.id,
    slug: board.slug ?? "",
    name: board.name,
    emoji: board.emoji ?? null,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}

export function compactListEntity(list: List): WriteListEntity {
  return {
    type: "list",
    id: list.id,
    name: list.name,
    order: list.order,
    color: list.color,
    emoji: list.emoji ?? null,
  };
}

export function compactTaskEntity(task: Task): WriteTaskEntity {
  return {
    type: "task",
    id: task.id,
    listId: task.listId,
    groupId: task.groupId,
    priorityId: task.priorityId,
    status: task.status,
    title: task.title,
    body: task.body,
    color: task.color ?? null,
    emoji: task.emoji ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    closedAt: task.closedAt ?? null,
  };
}

export function writeSuccess(
  board: Board,
  entity: WriteEntity,
): WriteSuccessEnvelope {
  return {
    ok: true,
    boardId: board.id,
    boardSlug: board.slug ?? "",
    boardUpdatedAt: board.updatedAt,
    entity,
  };
}

/** New list is appended at the end — max `sort_order` / `order`. */
export function findNewestList(board: Board): List | undefined {
  if (board.lists.length === 0) return undefined;
  return board.lists.reduce((a, b) =>
    b.order > a.order || (b.order === a.order && b.id > a.id) ? b : a,
  );
}

/** After `POST .../tasks`, the created row is the task with the largest id on the board. */
export function findNewestTask(board: Board): Task | undefined {
  if (board.tasks.length === 0) return undefined;
  return board.tasks.reduce((a, b) => (b.id > a.id ? b : a));
}

export function findTaskById(board: Board, taskId: number): Task | undefined {
  return board.tasks.find((t) => t.id === taskId);
}
