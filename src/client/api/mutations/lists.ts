import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TASK_MANAGER_MUTATION_RESPONSE_ENTITY_V1,
  TASK_MANAGER_MUTATION_RESPONSE_HEADER,
  type ListDeleteMutationResult,
  type ListMutationResult,
} from "../../../shared/mutationResults";
import type { Board, List } from "../../../shared/models";
import { invalidateNotificationQueries } from "../notifications";
import {
  boardKeys,
  fetchJson,
  invalidateBoardStatsQueries,
  trashKeys,
} from "../queries";
import { tempNumericId } from "./shared";

const jsonHeaders = {
  "Content-Type": "application/json",
  [TASK_MANAGER_MUTATION_RESPONSE_HEADER]: TASK_MANAGER_MUTATION_RESPONSE_ENTITY_V1,
} as const;

/** Reorder returns a full `Board`; server ignores the granular mutation header on that route. */
const jsonHeadersFullBoardOnly = { "Content-Type": "application/json" } as const;

export function useCreateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      name: string;
      emoji?: string | null;
    }) => {
      return fetchJson<ListMutationResult>(`/api/boards/${input.boardId}/lists`, {
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
      return { prev, optimisticListId: optimisticList.id };
    },
    onError: (_err, input, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<Board>(boardKeys.detail(input.boardId), ctx.prev);
      }
    },
    onSuccess: (data, _input, ctx) => {
      qc.setQueryData<Board>(boardKeys.detail(data.boardId), (current) => {
        if (!current) return current;
        const optimisticId = ctx?.optimisticListId;
        const hasOptimistic =
          optimisticId != null && current.lists.some((list) => list.id === optimisticId);
        return {
          ...current,
          lists: hasOptimistic
            ? current.lists.map((list) =>
                list.id === optimisticId ? data.entity : list,
              )
            : [...current.lists, data.entity],
          updatedAt: data.boardUpdatedAt,
        };
      });
      invalidateBoardStatsQueries(qc, data.boardId);
      invalidateNotificationQueries(qc);
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
      return fetchJson<ListMutationResult>(
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
      qc.setQueryData<Board>(boardKeys.detail(data.boardId), (current) => {
        if (!current) return current;
        return {
          ...current,
          lists: current.lists.map((list) =>
            list.id === data.entity.id ? data.entity : list,
          ),
          updatedAt: data.boardUpdatedAt,
        };
      });
      invalidateBoardStatsQueries(qc, data.boardId);
      invalidateNotificationQueries(qc);
    },
  });
}

export function useDeleteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { boardId: number; listId: number }) => {
      return fetchJson<ListDeleteMutationResult>(
        `/api/boards/${input.boardId}/lists/${input.listId}`,
        { method: "DELETE", headers: jsonHeaders },
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
      qc.setQueryData<Board>(boardKeys.detail(data.boardId), (current) => {
        if (!current) return current;
        return {
          ...current,
          lists: current.lists.filter((list) => list.id !== data.deletedListId),
          tasks: current.tasks.filter((task) => task.listId !== data.deletedListId),
          updatedAt: data.boardUpdatedAt,
        };
      });
      invalidateBoardStatsQueries(qc, data.boardId);
      void qc.invalidateQueries({ queryKey: trashKeys.all });
      invalidateNotificationQueries(qc);
    },
  });
}

export function useMoveList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      listId: number;
      beforeListId?: number;
      afterListId?: number;
      position?: "first" | "last";
    }) => {
      return fetchJson<Board>(`/api/boards/${input.boardId}/lists/move`, {
        method: "PUT",
        headers: jsonHeadersFullBoardOnly,
        body: JSON.stringify({
          listId: input.listId,
          beforeListId: input.beforeListId,
          afterListId: input.afterListId,
          position: input.position,
        }),
      });
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(boardKeys.detail(data.id), data);
      invalidateBoardStatsQueries(qc, data.id);
      invalidateNotificationQueries(qc);
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
        headers: jsonHeadersFullBoardOnly,
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
      invalidateNotificationQueries(qc);
    },
  });
}
