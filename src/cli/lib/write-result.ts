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

export type WriteDeletedEntity = {
  type: "board" | "list" | "task";
  id: number;
  slug?: string;
  deleted: true;
};

export type WriteEntity =
  | WriteBoardEntity
  | WriteListEntity
  | WriteTaskEntity
  | WriteDeletedEntity;

export type WriteSuccessEnvelope = {
  ok: true;
  boardId: number;
  boardSlug: string;
  boardUpdatedAt: string;
  entity: WriteEntity;
};

export type WriteDeleteEnvelope = {
  ok: true;
  boardId: number;
  boardSlug: string;
  boardUpdatedAt?: string;
  deleted: WriteDeletedEntity;
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
  board: Pick<Board, "id" | "updatedAt"> & { slug?: string },
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

export function deletedEntity(
  type: WriteDeletedEntity["type"],
  id: number,
  slug?: string,
): WriteDeletedEntity {
  return {
    type,
    id,
    slug,
    deleted: true,
  };
}

export function writeDeleted(
  board: Pick<Board, "id"> & { slug?: string; updatedAt?: string },
  deleted: WriteDeletedEntity,
): WriteDeleteEnvelope {
  return {
    ok: true,
    boardId: board.id,
    boardSlug: board.slug ?? "",
    boardUpdatedAt: board.updatedAt,
    deleted,
  };
}
