import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_BOARD_COLOR } from "../../../shared/boardColor";
import {
  createDefaultTaskGroups,
  DEFAULT_STATUS_IDS,
  type Board,
  type BoardIndexEntry,
  type GroupDefinition,
} from "../../../shared/models";
import { appNavigate } from "@/lib/appNavigate";
import { boardPath, parseBoardIdFromPath } from "@/lib/boardPath";
import { boardKeys, fetchJson } from "../queries";
import { tempNumericId } from "./shared";

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

const jsonHeaders = { "Content-Type": "application/json" } as const;

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name?: string }) => {
      return fetchJson<Board>("/api/boards", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ name: input.name }),
      });
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: boardKeys.all, exact: true });
      const previous = qc.getQueryData<BoardIndexEntry[]>(boardKeys.all);
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
      qc.setQueryData<BoardIndexEntry[]>(boardKeys.all, (old) => [
        ...(old ?? []),
        entry,
      ]);
      qc.setQueryData<Board>(boardKeys.detail(optimisticId), buildOptimisticBoard(optimisticId, name));
      appNavigate(boardPath(optimisticId));
      return { previous, optimisticId, previousPath };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        qc.setQueryData<BoardIndexEntry[]>(boardKeys.all, context.previous);
      }
      if (context?.optimisticId != null) {
        qc.removeQueries({ queryKey: boardKeys.detail(context.optimisticId) });
      }
      if (context?.previousPath != null) {
        appNavigate(context.previousPath, { replace: true });
      }
    },
    onSuccess: (data, _input, context) => {
      const optId = context?.optimisticId;
      if (optId != null) {
        qc.removeQueries({ queryKey: boardKeys.detail(optId) });
        qc.setQueryData<BoardIndexEntry[]>(boardKeys.all, (old) =>
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
      qc.setQueryData<Board>(boardKeys.detail(data.id), data);
      appNavigate(boardPath(data.id), { replace: true });
    },
  });
}

export function usePatchBoardName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { boardId: number; name: string }) => {
      return fetchJson<Board>(`/api/boards/${input.boardId}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ name: input.name }),
      });
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: boardKeys.all, exact: true });
      const prevList = qc.getQueryData<BoardIndexEntry[]>(boardKeys.all);
      const prevDetail = qc.getQueryData<Board>(boardKeys.detail(input.boardId));
      const trimmed = input.name.trim();
      qc.setQueryData<BoardIndexEntry[]>(boardKeys.all, (old) =>
        (old ?? []).map((e: BoardIndexEntry) =>
          e.id === input.boardId ? { ...e, name: trimmed } : e,
        ),
      );
      if (prevDetail) {
        qc.setQueryData<Board>(boardKeys.detail(input.boardId), {
          ...prevDetail,
          name: trimmed,
          updatedAt: new Date().toISOString(),
        });
      }
      return { prevList, prevDetail, boardId: input.boardId };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prevList) {
        qc.setQueryData<BoardIndexEntry[]>(boardKeys.all, ctx.prevList);
      }
      if (ctx?.prevDetail !== undefined) {
        qc.setQueryData<Board>(boardKeys.detail(ctx.boardId), ctx.prevDetail);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<BoardIndexEntry[]>(boardKeys.all, (old) =>
        (old ?? []).map((e: BoardIndexEntry) =>
          e.id === data.id ? { ...e, name: data.name } : e,
        ),
      );
      qc.setQueryData<Board>(boardKeys.detail(data.id), data);
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
      return fetchJson<Board>(`/api/boards/${input.boardId}/view-prefs`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify(input.patch),
      });
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(boardKeys.detail(input.boardId));
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
        qc.setQueryData<Board>(boardKeys.detail(input.boardId), next);
      }
      return { prev, boardId: input.boardId };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData<Board>(boardKeys.detail(ctx.boardId), ctx.prev);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(boardKeys.detail(data.id), data);
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
      return fetchJson<Board>(`/api/boards/${input.boardId}/groups`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ taskGroups: input.taskGroups }),
      });
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(boardKeys.detail(data.id), data);
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
      await qc.cancelQueries({ queryKey: boardKeys.all, exact: true });
      await qc.cancelQueries({ queryKey: boardKeys.detail(id), exact: true });
      const prevList = qc.getQueryData<BoardIndexEntry[]>(boardKeys.all);
      qc.setQueryData<BoardIndexEntry[]>(boardKeys.all, (old) =>
        (old ?? []).filter((e: BoardIndexEntry) => e.id !== id),
      );
      qc.removeQueries({ queryKey: boardKeys.detail(id) });
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
        qc.setQueryData<BoardIndexEntry[]>(boardKeys.all, ctx.prevList);
      }
      if (ctx?.wasSelected) {
        appNavigate(boardPath(ctx.id), { replace: true });
      }
    },
  });
}
