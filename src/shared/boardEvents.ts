export type BoardEventBase = {
  boardId: number;
  boardUpdatedAt: string;
};

export type BoardChangedEvent = BoardEventBase & {
  kind: "board-changed";
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

export type BoardEvent =
  | BoardChangedEvent
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskDeletedEvent
  | ListCreatedEvent
  | ListUpdatedEvent
  | ListDeletedEvent;
