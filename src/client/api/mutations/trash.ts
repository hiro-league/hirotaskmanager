import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateNotificationQueries } from "../notifications";
import {
  boardKeys,
  fetchJson,
  invalidateBoardStatsQueries,
  trashKeys,
} from "../queries";
import { withBrowserClientHeaders } from "../clientHeaders";

async function fetchTrashVoid(url: string, method: "DELETE"): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: withBrowserClientHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

function invalidateAfterTrashWrite(
  qc: ReturnType<typeof useQueryClient>,
  boardId: number | undefined,
) {
  void qc.invalidateQueries({ queryKey: trashKeys.all });
  void qc.invalidateQueries({ queryKey: boardKeys.all });
  if (boardId != null) {
    void qc.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
    invalidateBoardStatsQueries(qc, boardId);
  }
  invalidateNotificationQueries(qc);
}

export function useRestoreBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (boardId: number) => {
      return fetchJson<{ boardId: number; boardUpdatedAt: string }>(
        `/api/trash/boards/${boardId}/restore`,
        { method: "POST" },
      );
    },
    onSuccess: (data) => {
      invalidateAfterTrashWrite(qc, data.boardId);
    },
  });
}

export function useRestoreList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (listId: number) => {
      return fetchJson<{ boardId: number; boardUpdatedAt: string; listId: number }>(
        `/api/trash/lists/${listId}/restore`,
        { method: "POST" },
      );
    },
    onSuccess: (data) => {
      invalidateAfterTrashWrite(qc, data.boardId);
    },
  });
}

export function useRestoreTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: number) => {
      return fetchJson<{ boardId: number; boardUpdatedAt: string; taskId: number }>(
        `/api/trash/tasks/${taskId}/restore`,
        { method: "POST" },
      );
    },
    onSuccess: (data) => {
      invalidateAfterTrashWrite(qc, data.boardId);
    },
  });
}

export function usePurgeBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (boardId: number) => {
      await fetchTrashVoid(`/api/trash/boards/${boardId}`, "DELETE");
      return boardId;
    },
    onSuccess: (boardId) => {
      void qc.invalidateQueries({ queryKey: trashKeys.all });
      void qc.invalidateQueries({ queryKey: boardKeys.all });
      qc.removeQueries({ queryKey: boardKeys.detail(boardId) });
      invalidateNotificationQueries(qc);
    },
  });
}

export function usePurgeList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { listId: number; boardId: number }) => {
      await fetchTrashVoid(`/api/trash/lists/${input.listId}`, "DELETE");
      return input.boardId;
    },
    onSuccess: (boardId) => {
      invalidateAfterTrashWrite(qc, boardId);
    },
  });
}

export function usePurgeTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskId: number; boardId: number }) => {
      await fetchTrashVoid(`/api/trash/tasks/${input.taskId}`, "DELETE");
      return input.boardId;
    },
    onSuccess: (boardId) => {
      invalidateAfterTrashWrite(qc, boardId);
    },
  });
}
