import { Hono } from "hono";
import { paginateInMemory } from "../../shared/pagination";
import { getRequestAuthContext, type AppBindings } from "../auth";
import { parseListPagination } from "../lib/listPagination";
import {
  cliBoardReadError,
  cliDeleteBoardError,
  cliManageListError,
  cliManageTaskError,
} from "../cliPolicyGuard";
import {
  publishBoardChanged,
  publishBoardEvent,
  publishBoardIndexChanged,
} from "../events";
import { recordBoardPurged, recordBoardRestored } from "../notifications/recordBoard";
import { recordListPurged, recordListRestored } from "../notifications/recordList";
import { recordTaskPurged, recordTaskRestored } from "../notifications/recordTask";
import {
  boardIndexEntryById,
  loadBoard,
  purgeBoardById,
  readTrashedBoards,
  readTrashedLists,
  readTrashedTasks,
  restoreBoardById,
} from "../storage";
import { readBoardCliPolicy } from "../storage/system/cliPolicy";
import {
  findBoardIdForTrashedList,
  purgeListOnBoard,
  readListSnapshotById,
  restoreListOnBoard,
} from "../storage/lists";
import {
  findBoardIdForTrashedTask,
  purgeTaskOnBoard,
  readTaskSnapshotById,
  restoreTaskOnBoard,
} from "../storage/tasks";

export const trashRoute = new Hono<AppBindings>();

function filterForCli<T extends { boardId: number }>(
  principal: string,
  items: T[],
): T[] {
  if (principal !== "cli") return items;
  return items.filter((item) => readBoardCliPolicy(item.boardId)?.readBoard);
}

/** Trashed boards expose {@link TrashedBoardItem.boardId}. */
function filterTrashedBoardsForCli(
  principal: string,
  items: ReturnType<typeof readTrashedBoards>,
): ReturnType<typeof readTrashedBoards> {
  if (principal !== "cli") return items;
  return items.filter((b) => readBoardCliPolicy(b.boardId)?.readBoard);
}

trashRoute.get("/boards", async (c) => {
  const auth = getRequestAuthContext(c);
  const rows = filterTrashedBoardsForCli(auth.principal, readTrashedBoards());
  const page = parseListPagination(new URL(c.req.url).searchParams, {
    defaultLimit: null,
  });
  if (!page.ok) {
    return c.json({ error: page.error }, 400);
  }
  return c.json(paginateInMemory(rows, page.offset, page.limit));
});

trashRoute.get("/lists", async (c) => {
  const auth = getRequestAuthContext(c);
  const rows = filterForCli(auth.principal, readTrashedLists());
  const page = parseListPagination(new URL(c.req.url).searchParams, {
    defaultLimit: null,
  });
  if (!page.ok) {
    return c.json({ error: page.error }, 400);
  }
  return c.json(paginateInMemory(rows, page.offset, page.limit));
});

trashRoute.get("/tasks", async (c) => {
  const auth = getRequestAuthContext(c);
  const rows = filterForCli(auth.principal, readTrashedTasks());
  const page = parseListPagination(new URL(c.req.url).searchParams, {
    defaultLimit: null,
  });
  if (!page.ok) {
    return c.json({ error: page.error }, 400);
  }
  return c.json(paginateInMemory(rows, page.offset, page.limit));
});

trashRoute.post("/boards/:id/restore", async (c) => {
  const boardId = Number(c.req.param("id"));
  if (!Number.isFinite(boardId)) {
    return c.json({ error: "Invalid board id" }, 400);
  }
  const entry = await boardIndexEntryById(boardId);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const blocked = cliDeleteBoardError(c, boardId);
  if (blocked) return blocked;

  const outcome = restoreBoardById(boardId);
  if (!outcome.ok) return c.json({ error: "Board not in Trash" }, 404);
  const { boardUpdatedAt } = outcome.value;
  publishBoardChanged(boardId, boardUpdatedAt);
  publishBoardIndexChanged();
  const board = loadBoard(boardId);
  if (board) recordBoardRestored(c, entry, board);
  return c.json({ boardId, boardUpdatedAt });
});

trashRoute.post("/lists/:id/restore", async (c) => {
  const listId = Number(c.req.param("id"));
  if (!Number.isFinite(listId)) {
    return c.json({ error: "Invalid list id" }, 400);
  }
  const trashedBoardId = findBoardIdForTrashedList(listId);
  if (trashedBoardId == null) return c.json({ error: "List not in Trash" }, 404);

  const entry = await boardIndexEntryById(trashedBoardId);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;

  const listSnap = readListSnapshotById(trashedBoardId, listId);
  if (!listSnap) return c.json({ error: "List not found" }, 404);
  const blockedList = cliManageListError(c, entry.boardId, listSnap);
  if (blockedList) return blockedList;

  const outcome = restoreListOnBoard(trashedBoardId, listId);
  if (!outcome.ok) {
    // No-cascade trash: list stays explicitly trashed while board is trashed; restore is blocked until the board is active again.
    if (outcome.reason === "conflict") {
      return c.json(
        { error: "Restore the board from Trash before restoring this list." },
        409,
      );
    }
    return c.json({ error: "List not in Trash" }, 404);
  }
  const { boardId, boardUpdatedAt } = outcome.value;
  publishBoardEvent({
    kind: "list-restored",
    boardId,
    boardUpdatedAt,
    listId,
  });
  publishBoardChanged(boardId, boardUpdatedAt);
  const board = loadBoard(boardId);
  if (board) recordListRestored(c, entry, board, outcome.value.list);
  return c.json({
    boardId,
    boardUpdatedAt,
    listId,
  });
});

trashRoute.post("/tasks/:id/restore", async (c) => {
  const taskId = Number(c.req.param("id"));
  if (!Number.isFinite(taskId)) {
    return c.json({ error: "Invalid task id" }, 400);
  }
  const trashedBoardId = findBoardIdForTrashedTask(taskId);
  if (trashedBoardId == null) return c.json({ error: "Task not in Trash" }, 404);

  const entry = await boardIndexEntryById(trashedBoardId);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;

  const taskSnap = readTaskSnapshotById(trashedBoardId, taskId);
  if (!taskSnap) return c.json({ error: "Task not found" }, 404);
  const blockedTask = cliManageTaskError(c, entry.boardId, taskSnap);
  if (blockedTask) return blockedTask;

  const outcome = restoreTaskOnBoard(trashedBoardId, taskId);
  if (!outcome.ok) {
    // Blocked when board or list is still trashed (effective hide without auto-restoring children).
    if (outcome.reason === "conflict") {
      return c.json(
        {
          error:
            "Restore the board and list from Trash before restoring this task.",
        },
        409,
      );
    }
    return c.json({ error: "Task not in Trash" }, 404);
  }
  const { boardId, boardUpdatedAt, task } = outcome.value;
  publishBoardEvent({
    kind: "task-restored",
    boardId,
    boardUpdatedAt,
    taskId,
  });
  publishBoardChanged(boardId, boardUpdatedAt);
  const board = loadBoard(boardId);
  if (board) recordTaskRestored(c, entry, board, task);
  return c.json({ boardId, boardUpdatedAt, taskId });
});

trashRoute.delete("/boards/:id", async (c) => {
  const boardId = Number(c.req.param("id"));
  if (!Number.isFinite(boardId)) {
    return c.json({ error: "Invalid board id" }, 400);
  }
  const entry = await boardIndexEntryById(boardId);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const blocked = cliDeleteBoardError(c, boardId);
  if (blocked) return blocked;

  const ok = await purgeBoardById(boardId);
  if (!ok) return c.json({ error: "Board is not in Trash" }, 404);
  publishBoardChanged(boardId, new Date().toISOString());
  recordBoardPurged(c, entry);
  return c.body(null, 204);
});

trashRoute.delete("/lists/:id", async (c) => {
  const listId = Number(c.req.param("id"));
  if (!Number.isFinite(listId)) {
    return c.json({ error: "Invalid list id" }, 400);
  }
  const boardId = findBoardIdForTrashedList(listId);
  if (boardId == null) return c.json({ error: "List not in Trash" }, 404);

  const entry = await boardIndexEntryById(boardId);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;

  const listSnap = readListSnapshotById(boardId, listId);
  if (!listSnap) return c.json({ error: "List not found" }, 404);
  const blockedList = cliManageListError(c, entry.boardId, listSnap);
  if (blockedList) return blockedList;

  const result = purgeListOnBoard(boardId, listId);
  if (!result) return c.json({ error: "List is not in Trash" }, 404);
  publishBoardEvent({
    kind: "list-purged",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    listId,
  });
  publishBoardChanged(result.boardId, result.boardUpdatedAt);
  const board = loadBoard(result.boardId);
  if (board) recordListPurged(c, entry, board, listSnap);
  return c.body(null, 204);
});

trashRoute.delete("/tasks/:id", async (c) => {
  const taskId = Number(c.req.param("id"));
  if (!Number.isFinite(taskId)) {
    return c.json({ error: "Invalid task id" }, 400);
  }
  const boardId = findBoardIdForTrashedTask(taskId);
  if (boardId == null) return c.json({ error: "Task not in Trash" }, 404);

  const entry = await boardIndexEntryById(boardId);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;

  const taskSnap = readTaskSnapshotById(boardId, taskId);
  if (!taskSnap) return c.json({ error: "Task not found" }, 404);
  const blockedTask = cliManageTaskError(c, entry.boardId, taskSnap);
  if (blockedTask) return blockedTask;

  const result = purgeTaskOnBoard(boardId, taskId);
  if (!result) return c.json({ error: "Task is not in Trash" }, 404);
  publishBoardEvent({
    kind: "task-purged",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    taskId,
  });
  publishBoardChanged(result.boardId, result.boardUpdatedAt);
  const board = loadBoard(result.boardId);
  if (board) recordTaskPurged(c, entry, board, taskSnap);
  return c.body(null, 204);
});
