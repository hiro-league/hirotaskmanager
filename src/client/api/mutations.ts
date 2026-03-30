import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_BOARD_COLOR } from "../../shared/boardColor";
import {
  coerceTaskStatus,
  createDefaultTaskGroups,
  DEFAULT_STATUS_IDS,
  type Board,
  type BoardIndexEntry,
  type GroupDefinition,
  type List,
  type Task,
} from "../../shared/models";
import { appNavigate } from "@/lib/appNavigate";
import { boardPath, parseBoardIdFromPath } from "@/lib/boardPath";

/** Temporary client-only ids (negative) until the server assigns real PKs. */
function tempNumericId(): number {
  return -(Date.now() * 1000 + ((Math.random() * 0x7fffffff) | 0));
}

function buildOptimisticBoard(id: number, name: string): Board {
  const now = new Date().toISOString();
  const taskGroups = createDefaultTaskGroups();
  return {
    id,
    name,
    taskGroups,
    visibleStatuses: [...DEFAULT_STATUS_IDS],
    boardLayout: "stacked",
    boardColor: DEFAULT_BOARD_COLOR,
    showCounts: true,
    lists: [],
    tasks: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function parseBoardResponse(res: Response): Promise<Board> {
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<Board>;
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
      return parseBoardResponse(res);
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["boards"], exact: true });
      const previous = qc.getQueryData<BoardIndexEntry[]>(["boards"]);
      const previousPath = window.location.pathname;
      const optimisticId = tempNumericId();
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
      if (context?.optimisticId != null) {
        qc.removeQueries({ queryKey: ["boards", context.optimisticId] });
      }
      if (context?.previousPath != null) {
        appNavigate(context.previousPath, { replace: true });
      }
    },
    onSuccess: (data, _input, context) => {
      const optId = context?.optimisticId;
      if (optId != null) {
        qc.removeQueries({ queryKey: ["boards", optId] });
        qc.setQueryData<BoardIndexEntry[]>(["boards"], (old) =>
          (old ?? []).map((e: BoardIndexEntry) =>
            e.id === optId
              ? {
                  id: data.id,
                  slug: data.slug ?? e.slug,
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

/** Monolithic board replace — prefer granular mutations; kept for compatibility. */
export function useUpdateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (board: Board) => {
      const res = await fetch(`/api/boards/${board.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(board),
      });
      return parseBoardResponse(res);
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

export function usePatchBoardName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { boardId: number; name: string }) => {
      const res = await fetch(`/api/boards/${input.boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.name }),
      });
      return parseBoardResponse(res);
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["boards"], exact: true });
      const prevList = qc.getQueryData<BoardIndexEntry[]>(["boards"]);
      const prevDetail = qc.getQueryData<Board>(["boards", input.boardId]);
      const trimmed = input.name.trim();
      qc.setQueryData<BoardIndexEntry[]>(["boards"], (old) =>
        (old ?? []).map((e: BoardIndexEntry) =>
          e.id === input.boardId ? { ...e, name: trimmed } : e,
        ),
      );
      if (prevDetail) {
        qc.setQueryData<Board>(["boards", input.boardId], {
          ...prevDetail,
          name: trimmed,
          updatedAt: new Date().toISOString(),
        });
      }
      return { prevList, prevDetail, boardId: input.boardId };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prevList) {
        qc.setQueryData<BoardIndexEntry[]>(["boards"], ctx.prevList);
      }
      if (ctx?.prevDetail !== undefined) {
        qc.setQueryData<Board>(["boards", ctx.boardId], ctx.prevDetail);
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

export function usePatchBoardViewPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      patch: {
        visibleStatuses?: string[];
        statusBandWeights?: number[];
        boardLayout?: Board["boardLayout"];
        boardColor?: Board["boardColor"];
        backgroundImage?: string | null;
        showCounts?: boolean;
      };
    }) => {
      const res = await fetch(`/api/boards/${input.boardId}/view-prefs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.patch),
      });
      return parseBoardResponse(res);
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(["boards", input.boardId]);
      if (prev) {
        const p = input.patch;
        const next: Board = {
          ...prev,
          updatedAt: new Date().toISOString(),
        };
        if (p.visibleStatuses !== undefined) {
          next.visibleStatuses = p.visibleStatuses;
        }
        if (p.statusBandWeights !== undefined) {
          next.statusBandWeights = p.statusBandWeights;
        }
        if (p.boardLayout !== undefined) {
          next.boardLayout = p.boardLayout;
        }
        if (p.boardColor !== undefined) {
          next.boardColor = p.boardColor;
        }
        if (p.backgroundImage !== undefined) {
          next.backgroundImage =
            p.backgroundImage === null ? undefined : p.backgroundImage;
        }
        if (p.showCounts !== undefined) {
          next.showCounts = p.showCounts;
        }
        qc.setQueryData<Board>(["boards", input.boardId], next);
      }
      return { prev, boardId: input.boardId };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData<Board>(["boards", ctx.boardId], ctx.prev);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(["boards", data.id], data);
    },
  });
}

export function usePatchBoardTaskGroups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      taskGroups: GroupDefinition[];
    }) => {
      const res = await fetch(`/api/boards/${input.boardId}/groups`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskGroups: input.taskGroups }),
      });
      return parseBoardResponse(res);
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(["boards", data.id], data);
    },
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
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
      const selectedNum =
        selected != null ? Number(selected) : Number.NaN;
      if (Number.isFinite(selectedNum) && selectedNum === id) {
        const remaining = (prevList ?? []).filter((e) => e.id !== id);
        if (remaining.length > 0) {
          appNavigate(boardPath(remaining[0].id), { replace: true });
        } else {
          appNavigate("/", { replace: true });
        }
      }
      return { prevList, id, wasSelected: selectedNum === id };
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
  return useMutation({
    mutationFn: async (input: { boardId: number; name: string }) => {
      const res = await fetch(`/api/boards/${input.boardId}/lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.name }),
      });
      return parseBoardResponse(res);
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(["boards", input.boardId]);
      if (!prev) return { prev: undefined as Board | undefined };
      const trimmed = input.name.trim();
      const listName = trimmed || "New list";
      const maxOrder = prev.lists.reduce((m, l) => Math.max(m, l.order), -1);
      const optimisticList: List = {
        id: tempNumericId(),
        name: listName,
        order: maxOrder + 1,
      };
      const next: Board = {
        ...prev,
        lists: [...prev.lists, optimisticList],
        updatedAt: new Date().toISOString(),
      };
      qc.setQueryData<Board>(["boards", input.boardId], next);
      return { prev };
    },
    onError: (_err, input, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<Board>(["boards", input.boardId], ctx.prev);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(["boards", data.id], data);
    },
  });
}

export function useRenameList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      listId: number;
      name: string;
    }) => {
      const trimmed = input.name.trim();
      if (!trimmed) throw new Error("List name cannot be empty");
      const res = await fetch(
        `/api/boards/${input.boardId}/lists/${input.listId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        },
      );
      return parseBoardResponse(res);
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(["boards", input.boardId]);
      const trimmed = input.name.trim();
      if (!trimmed || !prev) return { prev: undefined as Board | undefined };
      const next: Board = {
        ...prev,
        lists: prev.lists.map((l) =>
          l.id === input.listId ? { ...l, name: trimmed } : l,
        ),
        updatedAt: new Date().toISOString(),
      };
      qc.setQueryData<Board>(["boards", input.boardId], next);
      return { prev };
    },
    onError: (_err, input, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<Board>(["boards", input.boardId], ctx.prev);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(["boards", data.id], data);
    },
  });
}

export function useDeleteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { boardId: number; listId: number }) => {
      const res = await fetch(
        `/api/boards/${input.boardId}/lists/${input.listId}`,
        { method: "DELETE" },
      );
      return parseBoardResponse(res);
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(["boards", input.boardId]);
      if (!prev) return { prev: undefined as Board | undefined };
      const next: Board = {
        ...prev,
        lists: prev.lists.filter((l) => l.id !== input.listId),
        tasks: prev.tasks.filter((t) => t.listId !== input.listId),
        updatedAt: new Date().toISOString(),
      };
      qc.setQueryData<Board>(["boards", input.boardId], next);
      return { prev };
    },
    onError: (_err, input, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<Board>(["boards", input.boardId], ctx.prev);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(["boards", data.id], data);
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      listId: number;
      status: string;
      title: string;
      body: string;
      groupId: number;
    }) => {
      const res = await fetch(`/api/boards/${input.boardId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listId: input.listId,
          status: coerceTaskStatus(input.status),
          title: input.title,
          body: input.body,
          groupId: input.groupId,
        }),
      });
      return parseBoardResponse(res);
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(["boards", input.boardId]);
      if (!prev) return { prev: undefined as Board | undefined };
      const inBand = prev.tasks.filter(
        (t) => t.listId === input.listId && t.status === input.status,
      );
      const maxOrder = inBand.reduce((m, t) => Math.max(m, t.order), -1);
      const now = new Date().toISOString();
      const task: Task = {
        id: tempNumericId(),
        listId: input.listId,
        title: input.title,
        body: input.body,
        groupId: input.groupId,
        status: coerceTaskStatus(input.status),
        order: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
      };
      const next: Board = {
        ...prev,
        tasks: [...prev.tasks, task],
        updatedAt: now,
      };
      qc.setQueryData<Board>(["boards", input.boardId], next);
      return { prev };
    },
    onError: (_err, input, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<Board>(["boards", input.boardId], ctx.prev);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(["boards", data.id], data);
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { boardId: number; task: Task }) => {
      const t = input.task;
      const res = await fetch(
        `/api/boards/${input.boardId}/tasks/${t.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: t.title,
            body: t.body,
            listId: t.listId,
            groupId: t.groupId,
            status: t.status,
            order: t.order,
            color: t.color ?? null,
          }),
        },
      );
      return parseBoardResponse(res);
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(["boards", input.boardId]);
      if (!prev) return { prev: undefined as Board | undefined };
      const p = prev.tasks.find((t) => t.id === input.task.id);
      if (!p) return { prev };
      const statusChanged = p.status !== input.task.status;
      const listChanged = p.listId !== input.task.listId;
      let order = input.task.order;
      if (statusChanged || listChanged) {
        const inBand = prev.tasks.filter(
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
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === task.id ? task : t)),
        updatedAt: task.updatedAt,
      };
      qc.setQueryData<Board>(["boards", input.boardId], next);
      return { prev };
    },
    onError: (_err, input, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<Board>(["boards", input.boardId], ctx.prev);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(["boards", data.id], data);
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { boardId: number; taskId: number }) => {
      const res = await fetch(
        `/api/boards/${input.boardId}/tasks/${input.taskId}`,
        { method: "DELETE" },
      );
      return parseBoardResponse(res);
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(["boards", input.boardId]);
      if (!prev) return { prev: undefined as Board | undefined };
      const now = new Date().toISOString();
      const next: Board = {
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== input.taskId),
        updatedAt: now,
      };
      qc.setQueryData<Board>(["boards", input.boardId], next);
      return { prev };
    },
    onError: (_err, input, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<Board>(["boards", input.boardId], ctx.prev);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(["boards", data.id], data);
    },
  });
}

/** Reorder lists left/right; `orderedListIds` is the full list of ids in display order. */
export function useReorderLists() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      orderedListIds: number[];
    }) => {
      const res = await fetch(`/api/boards/${input.boardId}/lists/order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedListIds: input.orderedListIds }),
      });
      return parseBoardResponse(res);
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(["boards", input.boardId]);
      if (!prev) return { prev: undefined as Board | undefined };
      if (input.orderedListIds.length !== prev.lists.length) {
        return { prev };
      }
      const byId = new Map(prev.lists.map((l) => [l.id, l] as const));
      for (const id of input.orderedListIds) {
        if (!byId.has(id)) return { prev };
      }
      const lists: List[] = input.orderedListIds.map((id, order) => {
        const list = byId.get(id)!;
        return { ...list, order };
      });
      const next: Board = {
        ...prev,
        lists,
        updatedAt: new Date().toISOString(),
      };
      qc.setQueryData<Board>(["boards", input.boardId], next);
      return { prev };
    },
    onError: (_err, input, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<Board>(["boards", input.boardId], ctx.prev);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(["boards", data.id], data);
    },
  });
}
