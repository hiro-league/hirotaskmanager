import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReleaseDefinition } from "../../../shared/models";
import { invalidateBoardStatsQueries, boardKeys, fetchJson } from "../queries";
import { invalidateNotificationQueries } from "../notifications";

const jsonHeaders = { "Content-Type": "application/json" } as const;

export function useCreateBoardRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      name: string;
      color?: string | null;
      releaseDate?: string | null;
    }) => {
      const body: Record<string, unknown> = { name: input.name };
      if (input.color !== undefined) body.color = input.color;
      if (input.releaseDate !== undefined) body.releaseDate = input.releaseDate;
      return fetchJson<ReleaseDefinition>(`/api/boards/${input.boardId}/releases`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
    },
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: boardKeys.detail(input.boardId) });
      invalidateBoardStatsQueries(qc, input.boardId);
      invalidateNotificationQueries(qc);
    },
  });
}

export function useUpdateBoardRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      releaseId: number;
      name?: string;
      color?: string | null;
      releaseDate?: string | null;
    }) => {
      const body: Record<string, unknown> = {};
      if (input.name !== undefined) body.name = input.name;
      if (input.color !== undefined) body.color = input.color;
      if (input.releaseDate !== undefined) body.releaseDate = input.releaseDate;
      return fetchJson<ReleaseDefinition>(
        `/api/boards/${input.boardId}/releases/${input.releaseId}`,
        { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(body) },
      );
    },
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: boardKeys.detail(input.boardId) });
      invalidateBoardStatsQueries(qc, input.boardId);
      invalidateNotificationQueries(qc);
    },
  });
}

export function useDeleteBoardRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: number;
      releaseId: number;
      moveTasksToReleaseId?: number;
    }) => {
      const q =
        input.moveTasksToReleaseId != null
          ? `?moveTasksTo=${input.moveTasksToReleaseId}`
          : "";
      await fetchJson<null>(
        `/api/boards/${input.boardId}/releases/${input.releaseId}${q}`,
        { method: "DELETE" },
      );
    },
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: boardKeys.detail(input.boardId) });
      invalidateBoardStatsQueries(qc, input.boardId);
      invalidateNotificationQueries(qc);
    },
  });
}
