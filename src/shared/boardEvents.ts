import type { ReleaseDefinition } from "./models";

export type BoardEventBase = {
  boardId: number;
  boardUpdatedAt: string;
};

export type BoardChangedEvent = BoardEventBase & {
  kind: "board-changed";
};

/** Create or patch of a board release — clients may merge into cache without refetching the full board. */
export type ReleaseUpsertedEvent = BoardEventBase & {
  kind: "release-upserted";
  release: ReleaseDefinition;
};

export type TaskCreatedEvent = BoardEventBase & {
  kind: "task-created";
  taskId: number;
};

export type TaskUpdatedEvent = BoardEventBase & {
  kind: "task-updated";
  taskId: number;
};

export type TaskDeletedEvent = BoardEventBase & {
  kind: "task-deleted";
  taskId: number;
};

export type ListCreatedEvent = BoardEventBase & {
  kind: "list-created";
  listId: number;
};

export type ListUpdatedEvent = BoardEventBase & {
  kind: "list-updated";
  listId: number;
};

export type ListDeletedEvent = BoardEventBase & {
  kind: "list-deleted";
  listId: number;
};

/** Task moved to Trash (soft delete). */
export type TaskTrashedEvent = BoardEventBase & {
  kind: "task-trashed";
  taskId: number;
};

/** List moved to Trash (soft delete). */
export type ListTrashedEvent = BoardEventBase & {
  kind: "list-trashed";
  listId: number;
};

export type TaskRestoredEvent = BoardEventBase & {
  kind: "task-restored";
  taskId: number;
};

export type ListRestoredEvent = BoardEventBase & {
  kind: "list-restored";
  listId: number;
};

/** Task permanently deleted from Trash. */
export type TaskPurgedEvent = BoardEventBase & {
  kind: "task-purged";
  taskId: number;
};

/** List permanently deleted from Trash. */
export type ListPurgedEvent = BoardEventBase & {
  kind: "list-purged";
  listId: number;
};

/** Board list (`GET /api/boards`) changed — create, trash, restore, or index metadata patch. */
export type BoardIndexChangedEvent = {
  kind: "board-index-changed";
};

export type BoardEvent =
  | BoardIndexChangedEvent
  | BoardChangedEvent
  | ReleaseUpsertedEvent
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskDeletedEvent
  | TaskTrashedEvent
  | TaskRestoredEvent
  | TaskPurgedEvent
  | ListCreatedEvent
  | ListUpdatedEvent
  | ListDeletedEvent
  | ListTrashedEvent
  | ListRestoredEvent
  | ListPurgedEvent;
