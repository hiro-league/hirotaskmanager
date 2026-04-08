import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TASK_MANAGER_MUTATION_RESPONSE_ENTITY_V1,
  TASK_MANAGER_MUTATION_RESPONSE_HEADER,
  type TaskDeleteMutationResult,
  type TaskMutationResult,
} from "../../../shared/mutationResults";
import type { Board, Task } from "../../../shared/models";
import { noneTaskPriorityId, sortPrioritiesByValue } from "../../../shared/models";
import { invalidateNotificationQueries } from "../notifications";
import {
  boardKeys,
  boardTaskDetailKey,
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
      /** Omitted → server uses builtin `none` for the board. */
      priorityId?: number;
      /** Omitted → server applies board auto-assign rules; `null` → untagged. */
      releaseId?: number | null;
      emoji?: string | null;
    }) => {
      const body: Record<string, unknown> = {
        listId: input.listId,
        status: input.status,
        title: input.title,
        body: input.body,
        groupId: input.groupId,
        emoji: input.emoji ?? null,
      };
      if (input.priorityId !== undefined) {
        body.priorityId = input.priorityId;
      }
      if (input.releaseId !== undefined) {
        body.releaseId = input.releaseId;
      }
      return fetchJson<TaskMutationResult>(`/api/boards/${input.boardId}/tasks`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(body),
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
      const defaultNone =
        noneTaskPriorityId(prev.taskPriorities) ??
        sortPrioritiesByValue(prev.taskPriorities)[0]?.id;
      if (defaultNone == null) return { prev, optimisticTaskId: undefined };
      const task: Task = {
        id: tempNumericId(),
        listId: input.listId,
        title: input.title,
        body: input.body,
        groupId: input.groupId,
        priorityId: input.priorityId ?? defaultNone,
        status: input.status,
        order: maxOrder + 1,
        emoji: input.emoji ?? null,
        ...(input.releaseId !== undefined ? { releaseId: input.releaseId } : {}),
        createdAt: now,
        updatedAt: now,
      };
      const next: Board = {
        ...prev,
        tasks: [...prev.tasks, task],
        updatedAt: now,
      };
      qc.setQueryData<Board>(boardKeys.detail(input.boardId), next);
      return { prev, optimisticTaskId: task.id };
    },
    onError: (_err, input, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<Board>(boardKeys.detail(input.boardId), ctx.prev);
      }
    },
    onSuccess: (data, _input, ctx) => {
      qc.setQueryData<Board>(boardKeys.detail(data.boardId), (current) => {
        if (!current) return current;
        const optimisticId = ctx?.optimisticTaskId;
        const hasOptimistic =
          optimisticId != null && current.tasks.some((task) => task.id === optimisticId);
        return {
          ...current,
          tasks: hasOptimistic
            ? current.tasks.map((task) =>
                task.id === optimisticId ? data.entity : task,
              )
            : [...current.tasks, data.entity],
          updatedAt: data.boardUpdatedAt,
        };
      });
      invalidateBoardStatsQueries(qc, data.boardId);
      invalidateNotificationQueries(qc);
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { boardId: number; task: Task }) => {
      const t = input.task;
      return fetchJson<TaskMutationResult>(
        `/api/boards/${input.boardId}/tasks/${t.id}`,
        {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({
            title: t.title,
            body: t.body,
            listId: t.listId,
            groupId: t.groupId,
            priorityId: t.priorityId,
            status: t.status,
            order: t.order,
            color: t.color ?? null,
            emoji: t.emoji ?? null,
            releaseId: t.releaseId ?? null,
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
      qc.setQueryData<Board>(boardKeys.detail(data.boardId), (current) => {
        if (!current) return current;
        return {
          ...current,
          tasks: current.tasks.map((task) =>
            task.id === data.entity.id ? data.entity : task,
          ),
          updatedAt: data.boardUpdatedAt,
        };
      });
      qc.setQueryData(boardTaskDetailKey(data.boardId, data.entity.id), data.entity);
      invalidateBoardStatsQueries(qc, data.boardId);
      invalidateNotificationQueries(qc);
    },
  });
}

export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      taskId: number;
      toListId?: number;
      toStatus?: string;
      beforeTaskId?: number;
      afterTaskId?: number;
      position?: "first" | "last";
      visibleOrderedTaskIds?: number[];
    }) => {
      return fetchJson<Board>(`/api/boards/${input.boardId}/tasks/move`, {
        method: "PUT",
        headers: jsonHeadersFullBoardOnly,
        body: JSON.stringify({
          taskId: input.taskId,
          toListId: input.toListId,
          toStatus: input.toStatus,
          beforeTaskId: input.beforeTaskId,
          afterTaskId: input.afterTaskId,
          position: input.position,
          visibleOrderedTaskIds: input.visibleOrderedTaskIds,
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
        headers: jsonHeadersFullBoardOnly,
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
      invalidateBoardStatsQueries(qc, data.id);
      invalidateNotificationQueries(qc);
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { boardId: number; taskId: number }) => {
      return fetchJson<TaskDeleteMutationResult>(
        `/api/boards/${input.boardId}/tasks/${input.taskId}`,
        { method: "DELETE", headers: jsonHeaders },
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
      qc.setQueryData<Board>(boardKeys.detail(data.boardId), (current) => {
        if (!current) return current;
        return {
          ...current,
          tasks: current.tasks.filter((task) => task.id !== data.deletedTaskId),
          updatedAt: data.boardUpdatedAt,
        };
      });
      qc.removeQueries({
        queryKey: boardTaskDetailKey(data.boardId, data.deletedTaskId),
      });
      invalidateBoardStatsQueries(qc, data.boardId);
      void qc.invalidateQueries({ queryKey: trashKeys.all });
      invalidateNotificationQueries(qc);
    },
  });
}
