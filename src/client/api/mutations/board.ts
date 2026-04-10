import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_BOARD_COLOR } from "../../../shared/boardColor";
import {
  EMPTY_BOARD_CLI_POLICY,
  type BoardCliPolicy,
} from "../../../shared/cliPolicy";
import {
  createDefaultTaskGroups,
  createDefaultTaskPriorities,
  DEFAULT_STATUS_IDS,
  sortTaskGroupsForDisplay,
  type Board,
  type BoardIndexEntry,
  type TaskPriorityDefinition,
} from "../../../shared/models";
import type { PatchBoardTaskGroupConfigInput } from "../../../shared/taskGroupConfig";
import { appNavigate } from "@/lib/appNavigate";
import { boardPath, parseBoardIdFromPath } from "@/lib/boardPath";
import { withBrowserClientHeaders } from "../clientHeaders";
import { invalidateNotificationQueries } from "../notifications";
import { boardKeys, fetchJson, trashKeys } from "../queries";
import { tempNumericId } from "./shared";

function buildOptimisticBoard(id: number, name: string): Board {
  const now = new Date().toISOString();
  const taskGroups = createDefaultTaskGroups();
  const taskPriorities = createDefaultTaskPriorities();
  const firstGroupId =
    sortTaskGroupsForDisplay(taskGroups)[0]?.groupId ?? 0;
  return {
    boardId: id,
    name,
    emoji: null,
    description: "",
    cliPolicy: EMPTY_BOARD_CLI_POLICY,
    taskGroups,
    defaultTaskGroupId: firstGroupId,
    deletedGroupFallbackId: firstGroupId,
    taskPriorities,
    releases: [],
    defaultReleaseId: null,
    autoAssignReleaseOnCreateUi: false,
    autoAssignReleaseOnCreateCli: false,
    visibleStatuses: [...DEFAULT_STATUS_IDS],
    boardLayout: "stacked",
    boardColor: DEFAULT_BOARD_COLOR,
    showStats: false,
    muteCelebrationSounds: false,
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
        boardId: optimisticId,
        slug: "",
        name,
        emoji: null,
        description: "",
        cliPolicy: EMPTY_BOARD_CLI_POLICY,
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
            e.boardId === optId
              ? {
                  boardId: data.boardId,
                  slug: data.slug ?? e.slug,
                  name: data.name,
                  emoji: data.emoji ?? null,
                  description: data.description ?? "",
                  cliPolicy: data.cliPolicy,
                  createdAt: data.createdAt,
                }
              : e,
          ),
        );
      }
      qc.setQueryData<Board>(boardKeys.detail(data.boardId), data);
      appNavigate(boardPath(data.boardId), { replace: true });
      invalidateNotificationQueries(qc);
    },
  });
}

/** PATCH `/api/boards/:id` — board metadata and optional theme color. */
export function usePatchBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      name?: string;
      emoji?: string | null;
      cliPolicy?: BoardCliPolicy;
      description?: string | null;
      boardColor?: Board["boardColor"];
      defaultReleaseId?: number | null;
      autoAssignReleaseOnCreateUi?: boolean;
      autoAssignReleaseOnCreateCli?: boolean;
    }) => {
      const body: Record<string, unknown> = {};
      if (input.name !== undefined) body.name = input.name;
      if (input.emoji !== undefined) body.emoji = input.emoji;
      if (input.cliPolicy !== undefined) body.cliPolicy = input.cliPolicy;
      if (input.description !== undefined) body.description = input.description;
      if (input.boardColor !== undefined) body.boardColor = input.boardColor;
      if (input.defaultReleaseId !== undefined) {
        body.defaultReleaseId = input.defaultReleaseId;
      }
      if (input.autoAssignReleaseOnCreateUi !== undefined) {
        body.autoAssignReleaseOnCreateUi = input.autoAssignReleaseOnCreateUi;
      }
      if (input.autoAssignReleaseOnCreateCli !== undefined) {
        body.autoAssignReleaseOnCreateCli = input.autoAssignReleaseOnCreateCli;
      }
      return fetchJson<Board>(`/api/boards/${input.boardId}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: boardKeys.all, exact: true });
      const prevList = qc.getQueryData<BoardIndexEntry[]>(boardKeys.all);
      const prevDetail = qc.getQueryData<Board>(boardKeys.detail(input.boardId));
      const trimmed =
        input.name !== undefined ? input.name.trim() : undefined;
      qc.setQueryData<BoardIndexEntry[]>(boardKeys.all, (old) =>
        (old ?? []).map((e: BoardIndexEntry) =>
          e.boardId === input.boardId
            ? {
                ...e,
                ...(trimmed !== undefined ? { name: trimmed } : {}),
                ...(input.emoji !== undefined ? { emoji: input.emoji } : {}),
                ...(input.cliPolicy !== undefined
                  ? { cliPolicy: input.cliPolicy }
                  : {}),
                ...(input.description !== undefined
                  ? { description: input.description ?? "" }
                  : {}),
              }
            : e,
        ),
      );
      if (prevDetail) {
        qc.setQueryData<Board>(boardKeys.detail(input.boardId), {
          ...prevDetail,
          ...(trimmed !== undefined ? { name: trimmed } : {}),
          ...(input.emoji !== undefined ? { emoji: input.emoji } : {}),
          ...(input.cliPolicy !== undefined
            ? { cliPolicy: input.cliPolicy }
            : {}),
          ...(input.description !== undefined
            ? { description: input.description ?? "" }
            : {}),
          ...(input.boardColor !== undefined
            ? { boardColor: input.boardColor ?? undefined }
            : {}),
          ...(input.defaultReleaseId !== undefined
            ? { defaultReleaseId: input.defaultReleaseId }
            : {}),
          ...(input.autoAssignReleaseOnCreateUi !== undefined
            ? { autoAssignReleaseOnCreateUi: input.autoAssignReleaseOnCreateUi }
            : {}),
          ...(input.autoAssignReleaseOnCreateCli !== undefined
            ? {
                autoAssignReleaseOnCreateCli: input.autoAssignReleaseOnCreateCli,
              }
            : {}),
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
          e.boardId === data.boardId
            ? {
                ...e,
                name: data.name,
                slug: data.slug ?? e.slug,
                emoji: data.emoji ?? null,
                description: data.description ?? "",
                cliPolicy: data.cliPolicy,
              }
            : e,
        ),
      );
      qc.setQueryData<Board>(boardKeys.detail(data.boardId), data);
      invalidateNotificationQueries(qc);
    },
  });
}

/** @deprecated Prefer {@link usePatchBoard}; kept for call sites that only rename. */
export const usePatchBoardName = usePatchBoard;

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
        showStats?: boolean;
        /** @deprecated Use `showStats`; still accepted by the API for older callers. */
        showCounts?: boolean;
        muteCelebrationSounds?: boolean;
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
        if (p.showStats !== undefined) {
          next.showStats = p.showStats;
        } else if (p.showCounts !== undefined) {
          next.showStats = p.showCounts;
        }
        if (p.muteCelebrationSounds !== undefined) {
          next.muteCelebrationSounds = p.muteCelebrationSounds;
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
      qc.setQueryData<Board>(boardKeys.detail(data.boardId), data);
      invalidateNotificationQueries(qc);
    },
  });
}

export function usePatchBoardTaskGroups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      config: PatchBoardTaskGroupConfigInput;
    }) => {
      return fetchJson<Board>(`/api/boards/${input.boardId}/groups`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify(input.config),
      });
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(boardKeys.detail(data.boardId), data);
      invalidateNotificationQueries(qc);
    },
  });
}

export function usePatchBoardTaskPriorities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      taskPriorities: TaskPriorityDefinition[];
    }) => {
      return fetchJson<Board>(`/api/boards/${input.boardId}/priorities`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ taskPriorities: input.taskPriorities }),
      });
    },
    onSuccess: (data) => {
      qc.setQueryData<Board>(boardKeys.detail(data.boardId), data);
      invalidateNotificationQueries(qc);
    },
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/boards/${id}`, {
        method: "DELETE",
        headers: withBrowserClientHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: boardKeys.all, exact: true });
      await qc.cancelQueries({ queryKey: boardKeys.detail(id), exact: true });
      const prevList = qc.getQueryData<BoardIndexEntry[]>(boardKeys.all);
      qc.setQueryData<BoardIndexEntry[]>(boardKeys.all, (old) =>
        (old ?? []).filter((e: BoardIndexEntry) => e.boardId !== id),
      );
      qc.removeQueries({ queryKey: boardKeys.detail(id) });
      const selected = parseBoardIdFromPath(window.location.pathname);
      const selectedNum =
        selected != null ? Number(selected) : Number.NaN;
      if (Number.isFinite(selectedNum) && selectedNum === id) {
        const remaining = (prevList ?? []).filter((e) => e.boardId !== id);
        if (remaining.length > 0) {
          appNavigate(boardPath(remaining[0].boardId), { replace: true });
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: trashKeys.all });
      invalidateNotificationQueries(qc);
    },
  });
}
