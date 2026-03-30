import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Board, List } from "../../../shared/models";
import { boardKeys, fetchJson } from "../queries";
import { tempNumericId } from "./shared";

const jsonHeaders = { "Content-Type": "application/json" } as const;

export function useCreateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { boardId: number; name: string }) => {
      return fetchJson<Board>(`/api/boards/${input.boardId}/lists`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ name: input.name }),
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
      return fetchJson<Board>(
        `/api/boards/${input.boardId}/lists/${input.listId}`,
        {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({ name: trimmed }),
        },
      );
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(boardKeys.detail(input.boardId));
      const trimmed = input.name.trim();
      if (!trimmed || !prev) return { prev: undefined as Board | undefined };
      const next: Board = {
        ...prev,
        lists: prev.lists.map((l) =>
          l.id === input.listId ? { ...l, name: trimmed } : l,
        ),
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
    },
  });
}
