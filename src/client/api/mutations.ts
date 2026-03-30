import { useMutation, useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { DEFAULT_BOARD_COLOR } from "../../shared/boardColor";
import {
  coerceTaskStatus,
  createDefaultTaskGroups,
  TASK_STATUSES,
  type Board,
  type BoardIndexEntry,
  type List,
  type Task,
} from "../../shared/models";
import { appNavigate } from "@/lib/appNavigate";
import { boardPath, parseBoardIdFromPath } from "@/lib/boardPath";
import { fetchBoard } from "./queries";

function buildOptimisticBoard(id: string, name: string): Board {
  const now = new Date().toISOString();
  const taskGroups = createDefaultTaskGroups();
  return {
    id,
    name,
    taskGroups,
    visibleStatuses: [...TASK_STATUSES],
    boardLayout: "stacked",
    boardColor: DEFAULT_BOARD_COLOR,
    showCounts: true,
    lists: [],
    tasks: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name?: string }) => {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.name }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<Board>;
    },
    onMutate: async (input) => {
      /** Only cancel the board index query — not `["boards", id]` detail queries. */
      await qc.cancelQueries({ queryKey: ["boards"], exact: true });
      const previous = qc.getQueryData<BoardIndexEntry[]>(["boards"]);
      const previousPath = window.location.pathname;
      const optimisticId = nanoid();
      const name =
        typeof input.name === "string" && input.name.trim()
          ? input.name.trim()
          : "New board";
      const entry: BoardIndexEntry = {
        id: optimisticId,
        slug: "",
        name,
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<BoardIndexEntry[]>(["boards"], (old) => [
        ...(old ?? []),
        entry,
      ]);
      qc.setQueryData<Board>(
        ["boards", optimisticId],
        buildOptimisticBoard(optimisticId, name),
      );
      appNavigate(boardPath(optimisticId));
      return { previous, optimisticId, previousPath };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        qc.setQueryData<BoardIndexEntry[]>(["boards"], context.previous);
      }
      if (context?.optimisticId) {
        qc.removeQueries({ queryKey: ["boards", context.optimisticId] });
      }
      if (context?.previousPath != null) {
        appNavigate(context.previousPath, { replace: true });
      }
    },
    onSuccess: (data, _input, context) => {
      const optId = context?.optimisticId;
      if (optId) {
        qc.removeQueries({ queryKey: ["boards", optId] });
        qc.setQueryData<BoardIndexEntry[]>(["boards"], (old) =>
          (old ?? []).map((e: BoardIndexEntry) =>
            e.id === optId
              ? {
                  id: data.id,
                  slug: e.slug,
                  name: data.name,
                  createdAt: data.createdAt,
                }
              : e,
          ),
        );
      }
      qc.setQueryData<Board>(["boards", data.id], data);
      appNavigate(boardPath(data.id), { replace: true });
    },
  });
}

export function useUpdateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (board: Board) => {
      const res = await fetch(`/api/boards/${board.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(board),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<Board>;
    },
    onMutate: async (board) => {
      await qc.cancelQueries({ queryKey: ["boards"], exact: true });
      const prevList = qc.getQueryData<BoardIndexEntry[]>(["boards"]);
      const prevDetail = qc.getQueryData<Board>(["boards", board.id]);
      qc.setQueryData<BoardIndexEntry[]>(["boards"], (old) =>
        (old ?? []).map((e: BoardIndexEntry) =>
          e.id === board.id ? { ...e, name: board.name } : e,
        ),
      );
      qc.setQueryData<Board>(["boards", board.id], board);
      return { prevList, prevDetail };
    },
    onError: (_err, board, ctx) => {
      if (ctx?.prevList) {
        qc.setQueryData<BoardIndexEntry[]>(["boards"], ctx.prevList);
      }
      if (ctx?.prevDetail !== undefined) {
        qc.setQueryData<Board>(["boards", board.id], ctx.prevDetail);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<BoardIndexEntry[]>(["boards"], (old) =>
        (old ?? []).map((e: BoardIndexEntry) =>
          e.id === data.id ? { ...e, name: data.name } : e,
        ),
      );
      qc.setQueryData<Board>(["boards", data.id], data);
    },
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/boards/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["boards"], exact: true });
      await qc.cancelQueries({ queryKey: ["boards", id], exact: true });
      const prevList = qc.getQueryData<BoardIndexEntry[]>(["boards"]);
      qc.setQueryData<BoardIndexEntry[]>(["boards"], (old) =>
        (old ?? []).filter((e: BoardIndexEntry) => e.id !== id),
      );
      qc.removeQueries({ queryKey: ["boards", id] });
      const selected = parseBoardIdFromPath(window.location.pathname);
      if (selected === id) {
        const remaining = (prevList ?? []).filter((e: BoardIndexEntry) => e.id !== id);
        if (remaining.length > 0) {
          appNavigate(boardPath(remaining[0].id), { replace: true });
        } else {
          appNavigate("/", { replace: true });
        }
      }
      return { prevList, id, wasSelected: selected === id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevList) {
        qc.setQueryData<BoardIndexEntry[]>(["boards"], ctx.prevList);
      }
      if (ctx?.wasSelected) {
        appNavigate(boardPath(ctx.id), { replace: true });
      }
    },
  });
}

export function useCreateList() {
  const qc = useQueryClient();
  const updateBoard = useUpdateBoard();
  return useMutation({
    mutationFn: async (input: { boardId: string; name: string }) => {
      const { boardId } = input;
      const trimmed = input.name.trim();
      const listName = trimmed || "New list";
      const board =
        qc.getQueryData<Board>(["boards", boardId]) ?? (await fetchBoard(boardId));
      const maxOrder = board.lists.reduce((m, l) => Math.max(m, l.order), -1);
      const newList: List = {
        id: nanoid(),
        name: listName,
        order: maxOrder + 1,
      };
      const next: Board = {
        ...board,
        lists: [...board.lists, newList],
        updatedAt: new Date().toISOString(),
      };
      return updateBoard.mutateAsync(next);
    },
  });
}

export function useRenameList() {
  const qc = useQueryClient();
  const updateBoard = useUpdateBoard();
  return useMutation({
    mutationFn: async (input: {
      boardId: string;
      listId: string;
      name: string;
    }) => {
      const board =
        qc.getQueryData<Board>(["boards", input.boardId]) ??
        (await fetchBoard(input.boardId));
      const trimmed = input.name.trim();
      if (!trimmed) throw new Error("List name cannot be empty");
      const next: Board = {
        ...board,
        lists: board.lists.map((l) =>
          l.id === input.listId ? { ...l, name: trimmed } : l,
        ),
        updatedAt: new Date().toISOString(),
      };
      return updateBoard.mutateAsync(next);
    },
  });
}

export function useDeleteList() {
  const qc = useQueryClient();
  const updateBoard = useUpdateBoard();
  return useMutation({
    mutationFn: async (input: { boardId: string; listId: string }) => {
      const board =
        qc.getQueryData<Board>(["boards", input.boardId]) ??
        (await fetchBoard(input.boardId));
      const next: Board = {
        ...board,
        lists: board.lists.filter((l) => l.id !== input.listId),
        tasks: board.tasks.filter((t) => t.listId !== input.listId),
        updatedAt: new Date().toISOString(),
      };
      return updateBoard.mutateAsync(next);
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const updateBoard = useUpdateBoard();
  return useMutation({
    mutationFn: async (input: {
      boardId: string;
      listId: string;
      status: string;
      title: string;
      body: string;
      group: string;
    }) => {
      const board =
        qc.getQueryData<Board>(["boards", input.boardId]) ??
        (await fetchBoard(input.boardId));
      const inBand = board.tasks.filter(
        (t) => t.listId === input.listId && t.status === input.status,
      );
      const maxOrder = inBand.reduce((m, t) => Math.max(m, t.order), -1);
      const now = new Date().toISOString();
      const task: Task = {
        id: nanoid(),
        listId: input.listId,
        title: input.title,
        body: input.body,
        group: input.group,
        status: coerceTaskStatus(input.status),
        order: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
      };
      const next: Board = {
        ...board,
        tasks: [...board.tasks, task],
        updatedAt: now,
      };
      return updateBoard.mutateAsync(next);
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  const updateBoard = useUpdateBoard();
  return useMutation({
    mutationFn: async (input: { boardId: string; task: Task }) => {
      const board =
        qc.getQueryData<Board>(["boards", input.boardId]) ??
        (await fetchBoard(input.boardId));
      const prev = board.tasks.find((t) => t.id === input.task.id);
      if (!prev) throw new Error("Task not found");
      const statusChanged = prev.status !== input.task.status;
      const listChanged = prev.listId !== input.task.listId;
      let order = input.task.order;
      if (statusChanged || listChanged) {
        const inBand = board.tasks.filter(
          (t) =>
            t.id !== input.task.id &&
            t.listId === input.task.listId &&
            t.status === input.task.status,
        );
        order = inBand.reduce((m, t) => Math.max(m, t.order), -1) + 1;
      }
      const task: Task = {
        ...input.task,
        order,
        updatedAt: new Date().toISOString(),
      };
      const next: Board = {
        ...board,
        tasks: board.tasks.map((t) => (t.id === task.id ? task : t)),
        updatedAt: task.updatedAt,
      };
      return updateBoard.mutateAsync(next);
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  const updateBoard = useUpdateBoard();
  return useMutation({
    mutationFn: async (input: { boardId: string; taskId: string }) => {
      const board =
        qc.getQueryData<Board>(["boards", input.boardId]) ??
        (await fetchBoard(input.boardId));
      const now = new Date().toISOString();
      const next: Board = {
        ...board,
        tasks: board.tasks.filter((t) => t.id !== input.taskId),
        updatedAt: now,
      };
      return updateBoard.mutateAsync(next);
    },
  });
}

/** Reorder lists left/right; `orderedListIds` is the full list of ids in display order. */
export function useReorderLists() {
  const qc = useQueryClient();
  const updateBoard = useUpdateBoard();
  return useMutation({
    mutationFn: async (input: { boardId: string; orderedListIds: string[] }) => {
      const board =
        qc.getQueryData<Board>(["boards", input.boardId]) ??
        (await fetchBoard(input.boardId));
      if (input.orderedListIds.length !== board.lists.length) {
        throw new Error("Invalid reorder: list count mismatch");
      }
      const byId = new Map(board.lists.map((l) => [l.id, l] as const));
      const lists: List[] = input.orderedListIds.map((id, order) => {
        const list = byId.get(id);
        if (!list) throw new Error(`Unknown list id: ${id}`);
        return { ...list, order };
      });
      const next: Board = {
        ...board,
        lists,
        updatedAt: new Date().toISOString(),
      };
      return updateBoard.mutateAsync(next);
    },
  });
}
