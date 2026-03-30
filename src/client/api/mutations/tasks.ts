import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Board, Task } from "../../../shared/models";
import { boardKeys, fetchJson } from "../queries";
import { tempNumericId } from "./shared";

const jsonHeaders = { "Content-Type": "application/json" } as const;

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
      return fetchJson<Board>(`/api/boards/${input.boardId}/tasks`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          listId: input.listId,
          status: input.status,
          title: input.title,
          body: input.body,
          groupId: input.groupId,
        }),
      });
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(boardKeys.detail(input.boardId));
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
        status: input.status,
        order: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
      };
      const next: Board = {
        ...prev,
        tasks: [...prev.tasks, task],
        updatedAt: now,
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

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { boardId: number; task: Task }) => {
      const t = input.task;
      return fetchJson<Board>(
        `/api/boards/${input.boardId}/tasks/${t.id}`,
        {
          method: "PATCH",
          headers: jsonHeaders,
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
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(boardKeys.detail(input.boardId));
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
        closedAt: input.task.closedAt,
      };
      const next: Board = {
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === task.id ? task : t)),
        updatedAt: task.updatedAt,
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

export function useReorderTasksInBand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      listId: number;
      status: string;
      orderedTaskIds: number[];
    }) => {
      return fetchJson<Board>(`/api/boards/${input.boardId}/tasks/reorder`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify({
          listId: input.listId,
          status: input.status,
          orderedTaskIds: input.orderedTaskIds,
        }),
      });
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(boardKeys.detail(input.boardId));
      if (!prev) return { prev: undefined as Board | undefined };
      const inBand = prev.tasks.filter(
        (t) => t.listId === input.listId && t.status === input.status,
      );
      if (inBand.length !== input.orderedTaskIds.length) return { prev };
      const bandIds = new Set(inBand.map((t) => t.id));
      for (const id of input.orderedTaskIds) {
        if (!bandIds.has(id)) return { prev };
      }
      const orderById = new Map(
        input.orderedTaskIds.map((id, i) => [id, i] as const),
      );
      const now = new Date().toISOString();
      const tasks = prev.tasks.map((t) => {
        if (t.listId !== input.listId || t.status !== input.status) return t;
        const o = orderById.get(t.id);
        if (o === undefined) return t;
        return { ...t, order: o, updatedAt: now };
      });
      const next: Board = { ...prev, tasks, updatedAt: now };
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

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { boardId: number; taskId: number }) => {
      return fetchJson<Board>(
        `/api/boards/${input.boardId}/tasks/${input.taskId}`,
        { method: "DELETE" },
      );
    },
    onMutate: async (input) => {
      const prev = qc.getQueryData<Board>(boardKeys.detail(input.boardId));
      if (!prev) return { prev: undefined as Board | undefined };
      const now = new Date().toISOString();
      const next: Board = {
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== input.taskId),
        updatedAt: now,
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
