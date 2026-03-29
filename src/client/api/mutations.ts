import { useMutation, useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import {
  DEFAULT_STATUS_DEFINITIONS,
  DEFAULT_TASK_TYPES,
  type Board,
  type BoardIndexEntry,
  type List,
} from "../../shared/models";
import { useSelectionStore } from "@/store/selection";
import { fetchBoard } from "./queries";

function buildOptimisticBoard(id: string, name: string): Board {
  const now = new Date().toISOString();
  const taskTypes = [...DEFAULT_TASK_TYPES];
  const statusDefinitions = [...DEFAULT_STATUS_DEFINITIONS];
  return {
    id,
    name,
    taskTypes,
    statusDefinitions,
    activeTaskType: taskTypes[0] ?? "task",
    visibleStatuses: [...statusDefinitions],
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
      await qc.cancelQueries({ queryKey: ["boards"] });
      const previous = qc.getQueryData<BoardIndexEntry[]>(["boards"]);
      const optimisticId = nanoid();
      const name =
        typeof input.name === "string" && input.name.trim()
          ? input.name.trim()
          : "New board";
      const entry: BoardIndexEntry = {
        id: optimisticId,
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
      useSelectionStore.getState().setSelectedBoardId(optimisticId);
      return { previous, optimisticId };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        qc.setQueryData<BoardIndexEntry[]>(["boards"], context.previous);
      }
      if (context?.optimisticId) {
        qc.removeQueries({ queryKey: ["boards", context.optimisticId] });
      }
      useSelectionStore.getState().setSelectedBoardId(null);
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
                  name: data.name,
                  createdAt: data.createdAt,
                }
              : e,
          ),
        );
      }
      qc.setQueryData<Board>(["boards", data.id], data);
      useSelectionStore.getState().setSelectedBoardId(data.id);
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
      await qc.cancelQueries({ queryKey: ["boards"] });
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
      await qc.cancelQueries({ queryKey: ["boards"] });
      const prevList = qc.getQueryData<BoardIndexEntry[]>(["boards"]);
      qc.setQueryData<BoardIndexEntry[]>(["boards"], (old) =>
        (old ?? []).filter((e: BoardIndexEntry) => e.id !== id),
      );
      qc.removeQueries({ queryKey: ["boards", id] });
      const selected = useSelectionStore.getState().selectedBoardId;
      if (selected === id) {
        useSelectionStore.getState().setSelectedBoardId(null);
      }
      return { prevList, id, wasSelected: selected === id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevList) {
        qc.setQueryData<BoardIndexEntry[]>(["boards"], ctx.prevList);
      }
      if (ctx?.wasSelected) {
        useSelectionStore.getState().setSelectedBoardId(ctx.id);
      }
    },
  });
}

export function useCreateList() {
  const qc = useQueryClient();
  const updateBoard = useUpdateBoard();
  return useMutation({
    mutationFn: async (boardId: string) => {
      const board =
        qc.getQueryData<Board>(["boards", boardId]) ?? (await fetchBoard(boardId));
      const maxOrder = board.lists.reduce((m, l) => Math.max(m, l.order), -1);
      const newList: List = {
        id: nanoid(),
        name: "New list",
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
