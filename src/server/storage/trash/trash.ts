import type {
  TrashedBoardItem,
  TrashedListItem,
  TrashedTaskItem,
} from "../../../shared/trashApi";
import { getDb } from "../../db";

export function readTrashedBoards(): TrashedBoardItem[] {
  const db = getDb();
  const rows = db
    .query(
      `SELECT id, name, slug, emoji, deleted_at FROM board
       WHERE deleted_at IS NOT NULL
       ORDER BY deleted_at DESC, id DESC`,
    )
    .all() as {
    id: number;
    name: string;
    slug: string;
    emoji: string | null;
    deleted_at: string;
  }[];
  return rows.map((r) => ({
    type: "board" as const,
    boardId: r.id,
    name: r.name,
    slug: r.slug,
    emoji:
      r.emoji != null && String(r.emoji).trim() !== ""
        ? String(r.emoji).trim()
        : null,
    deletedAt: r.deleted_at,
    canRestore: true as const,
  }));
}

export function readTrashedLists(): TrashedListItem[] {
  const db = getDb();
  const rows = db
    .query(
      `SELECT l.id, l.name, l.emoji, l.board_id, l.deleted_at,
              b.name AS board_name, b.deleted_at AS board_deleted_at
       FROM list l
       INNER JOIN board b ON b.id = l.board_id
       WHERE l.deleted_at IS NOT NULL
       ORDER BY l.deleted_at DESC, l.id DESC`,
    )
    .all() as {
    id: number;
    name: string;
    emoji: string | null;
    board_id: number;
    deleted_at: string;
    board_name: string;
    board_deleted_at: string | null;
  }[];
  return rows.map((r) => ({
    type: "list" as const,
    listId: r.id,
    name: r.name,
    emoji:
      r.emoji != null && String(r.emoji).trim() !== ""
        ? String(r.emoji).trim()
        : null,
    boardId: r.board_id,
    boardName: r.board_name,
    boardDeletedAt: r.board_deleted_at,
    deletedAt: r.deleted_at,
    canRestore: r.board_deleted_at == null,
  }));
}

export function readTrashedTasks(): TrashedTaskItem[] {
  const db = getDb();
  const rows = db
    .query(
      `SELECT t.id, t.title, t.emoji, t.board_id, t.list_id, t.deleted_at,
              b.name AS board_name, b.deleted_at AS board_deleted_at,
              l.name AS list_name, l.deleted_at AS list_deleted_at
       FROM task t
       INNER JOIN board b ON b.id = t.board_id
       INNER JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
       WHERE t.deleted_at IS NOT NULL
       ORDER BY t.deleted_at DESC, t.id DESC`,
    )
    .all() as {
    id: number;
    title: string;
    emoji: string | null;
    board_id: number;
    list_id: number;
    deleted_at: string;
    board_name: string;
    board_deleted_at: string | null;
    list_name: string;
    list_deleted_at: string | null;
  }[];
  return rows.map((r) => ({
    type: "task" as const,
    taskId: r.id,
    title: r.title,
    emoji:
      r.emoji != null && String(r.emoji).trim() !== ""
        ? String(r.emoji).trim()
        : null,
    boardId: r.board_id,
    boardName: r.board_name,
    boardDeletedAt: r.board_deleted_at,
    listId: r.list_id,
    listName: r.list_name,
    listDeletedAt: r.list_deleted_at,
    deletedAt: r.deleted_at,
    canRestore: r.board_deleted_at == null && r.list_deleted_at == null,
  }));
}
