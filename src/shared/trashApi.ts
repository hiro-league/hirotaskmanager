/** HTTP JSON shapes for Trash tab reads and restore error handling. */

export type TrashedBoardItem = {
  type: "board";
  id: number;
  name: string;
  slug: string;
  emoji: string | null;
  deletedAt: string;
  /** Always true for boards (no parent). */
  canRestore: true;
};

export type TrashedListItem = {
  type: "list";
  id: number;
  name: string;
  emoji: string | null;
  boardId: number;
  boardName: string;
  boardDeletedAt: string | null;
  deletedAt: string;
  canRestore: boolean;
};

export type TrashedTaskItem = {
  type: "task";
  id: number;
  title: string;
  emoji: string | null;
  boardId: number;
  boardName: string;
  boardDeletedAt: string | null;
  listId: number;
  listName: string;
  listDeletedAt: string | null;
  deletedAt: string;
  canRestore: boolean;
};

export type RestoreOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "not_found" | "conflict" };
