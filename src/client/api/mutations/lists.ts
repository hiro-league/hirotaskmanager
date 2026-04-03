import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Board, List } from "../../../shared/models";
import { boardKeys, fetchJson, invalidateBoardStatsQueries } from "../queries";
import { tempNumericId } from "./shared";

const jsonHeaders = { "Content-Type": "application/json" } as const;

export function useCreateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      name: string;
      emoji?: string | null;
    }) => {
      return fetchJson<Board>(`/api/boards/${input.boardId}/lists`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          name: input.name,
          emoji: input.emoji ?? null,
        }),
      });
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(boardKeys.detail(input.boardId));
      if (!prev) return { prev: undefined as Board | undefined };
      const trimmed = input.name.trim();
      const listName = trimmed || "New list";
      const maxOrder = prev.lists.reduce((m, l) => Math.max(m, l.order), -1);
      const optimisticList: List = {
        id: tempNumericId(),
        name: listName,
        order: maxOrder + 1,
        emoji: input.emoji ?? null,
      };
      const next: Board = {
        ...prev,
        lists: [...prev.lists, optimisticList],
        updatedAt: new Date().toISOString(),
      };
      qc.setQueryData<Board>(boardKeys.detail(input.boardId), next);
      return { prev };
    },
    onError: (_err, input, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<Board>(boardKeys.detail(input.boardId), ctx.prev);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(boardKeys.detail(data.id), data);
      invalidateBoardStatsQueries(qc, data.id);
    },
  });
}

/** PATCH list name and/or emoji (optional fields omitted leave server values unchanged). */
export function usePatchList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      listId: number;
      patch: { name?: string; emoji?: string | null };
    }) => {
      return fetchJson<Board>(
        `/api/boards/${input.boardId}/lists/${input.listId}`,
        {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify(input.patch),
        },
      );
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(boardKeys.detail(input.boardId));
      if (!prev) return { prev: undefined as Board | undefined };
      const { patch } = input;
      const next: Board = {
        ...prev,
        lists: prev.lists.map((l) => {
          if (l.id !== input.listId) return l;
          return {
            ...l,
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.emoji !== undefined ? { emoji: patch.emoji } : {}),
          };
        }),
        updatedAt: new Date().toISOString(),
      };
      qc.setQueryData<Board>(boardKeys.detail(input.boardId), next);
      return { prev };
    },
    onError: (_err, input, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<Board>(boardKeys.detail(input.boardId), ctx.prev);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(boardKeys.detail(data.id), data);
      invalidateBoardStatsQueries(qc, data.id);
    },
  });
}

export function useDeleteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { boardId: number; listId: number }) => {
      return fetchJson<Board>(
        `/api/boards/${input.boardId}/lists/${input.listId}`,
        { method: "DELETE" },
      );
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(boardKeys.detail(input.boardId));
      if (!prev) return { prev: undefined as Board | undefined };
      const next: Board = {
        ...prev,
        lists: prev.lists.filter((l) => l.id !== input.listId),
        tasks: prev.tasks.filter((t) => t.listId !== input.listId),
        updatedAt: new Date().toISOString(),
      };
      qc.setQueryData<Board>(boardKeys.detail(input.boardId), next);
      return { prev };
    },
    onError: (_err, input, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<Board>(boardKeys.detail(input.boardId), ctx.prev);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(boardKeys.detail(data.id), data);
      invalidateBoardStatsQueries(qc, data.id);
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
      return fetchJson<Board>(`/api/boards/${input.boardId}/lists/order`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify({ orderedListIds: input.orderedListIds }),
      });
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(boardKeys.detail(input.boardId));
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
      qc.setQueryData<Board>(boardKeys.detail(input.boardId), next);
      return { prev };
    },
    onError: (_err, input, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<Board>(boardKeys.detail(input.boardId), ctx.prev);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(boardKeys.detail(data.id), data);
      invalidateBoardStatsQueries(qc, data.id);
    },
  });
}
