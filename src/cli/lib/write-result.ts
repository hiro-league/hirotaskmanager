import type { Board, List, ReleaseDefinition, Task } from "../../shared/models";

/** Compact shapes for Phase 3 write command stdout (see docs/ai-cli.md). */
export type WriteBoardEntity = {
  type: "board";
  boardId: number;
  slug: string;
  name: string;
  emoji: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WriteListEntity = {
  type: "list";
  listId: number;
  name: string;
  order: number;
  color?: string;
  emoji: string | null;
};

export type WriteTaskEntity = {
  type: "task";
  taskId: number;
  listId: number;
  groupId: number;
  priorityId: number;
  status: string;
  title: string;
  body: string;
  color: string | null | undefined;
  emoji: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null | undefined;
};

export type WriteReleaseEntity = {
  type: "release";
  releaseId: number;
  name: string;
  color?: string | null;
  releaseDate?: string | null;
  createdAt: string;
};

/** Release row removed from the board (not Trash). */
export type WriteReleaseDeletedEntity = {
  type: "release";
  releaseId: number;
  deleted: true;
};

/** Board/list/task was moved to Trash (soft delete), not permanently removed. */
export type WriteTrashedEntity =
  | { type: "board"; boardId: number; slug?: string; trashed: true }
  | { type: "list"; listId: number; trashed: true }
  | { type: "task"; taskId: number; trashed: true };

export type WriteEntity =
  | WriteBoardEntity
  | WriteListEntity
  | WriteTaskEntity
  | WriteTrashedEntity
  | WriteReleaseEntity
  | WriteReleaseDeletedEntity;

export type WriteSuccessEnvelope = {
  ok: true;
  boardId: number;
  boardSlug: string;
  boardUpdatedAt: string;
  entity: WriteEntity;
};

export type WriteTrashMoveEnvelope = {
  ok: true;
  boardId: number;
  boardSlug: string;
  boardUpdatedAt?: string;
  trashed: WriteTrashedEntity;
};

export function compactBoardEntity(board: Board): WriteBoardEntity {
  return {
    type: "board",
    boardId: board.boardId,
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
    listId: list.listId,
    name: list.name,
    order: list.order,
    color: list.color,
    emoji: list.emoji ?? null,
  };
}

export function compactTaskEntity(task: Task): WriteTaskEntity {
  return {
    type: "task",
    taskId: task.taskId,
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

export function compactReleaseEntity(r: ReleaseDefinition): WriteReleaseEntity {
  return {
    type: "release",
    releaseId: r.releaseId,
    name: r.name,
    color: r.color,
    releaseDate: r.releaseDate,
    createdAt: r.createdAt,
  };
}

/** Stdout envelope for `releases delete` (structure delete, not Trash). */
export function writeReleaseDelete(
  board: Pick<Board, "boardId" | "updatedAt"> & { slug?: string },
  deletedReleaseId: number,
): WriteSuccessEnvelope {
  return writeSuccess(board, {
    type: "release",
    releaseId: deletedReleaseId,
    deleted: true,
  });
}

export function writeSuccess(
  board: Pick<Board, "boardId" | "updatedAt"> & { slug?: string },
  entity: WriteEntity,
): WriteSuccessEnvelope {
  return {
    ok: true,
    boardId: board.boardId,
    boardSlug: board.slug ?? "",
    boardUpdatedAt: board.updatedAt,
    entity,
  };
}

export function trashedEntity(
  type: "board",
  id: number,
  slug?: string,
): WriteTrashedEntity;
export function trashedEntity(type: "list", id: number): WriteTrashedEntity;
export function trashedEntity(type: "task", id: number): WriteTrashedEntity;
export function trashedEntity(
  type: WriteTrashedEntity["type"],
  id: number,
  slug?: string,
): WriteTrashedEntity {
  if (type === "board") {
    return { type: "board", boardId: id, slug, trashed: true };
  }
  if (type === "list") {
    return { type: "list", listId: id, trashed: true };
  }
  return { type: "task", taskId: id, trashed: true };
}

export function writeTrashMove(
  board: Pick<Board, "boardId"> & { slug?: string; updatedAt?: string },
  trashed: WriteTrashedEntity,
): WriteTrashMoveEnvelope {
  return {
    ok: true,
    boardId: board.boardId,
    boardSlug: board.slug ?? "",
    boardUpdatedAt: board.updatedAt,
    trashed,
  };
}
