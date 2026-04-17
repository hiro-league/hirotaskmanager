import { useCallback, useMemo, useState } from "react";
import {
  usePurgeBoard,
  usePurgeList,
  usePurgeTask,
  useRestoreBoard,
  useRestoreList,
  useRestoreTask,
} from "@/api/mutations";
import {
  useTrashedBoards,
  useTrashedLists,
  useTrashedTasks,
} from "@/api/queries";
import { useBackdropDismissClick } from "@/components/board/shortcuts/useBackdropDismissClick";
import { formatDateTimeMediumShort } from "@/lib/intlDateFormat";
import { formatInteger } from "@/lib/intlNumberFormat";
import { cn } from "@/lib/utils";
import { boardDisplayName, listDisplayName, taskDisplayTitle } from "../../../shared/models";
import type {
  TrashedBoardItem,
  TrashedListItem,
  TrashedTaskItem,
} from "../../../shared/trashApi";

type TrashTab = "boards" | "lists" | "tasks";

function formatDeletedAt(iso: string): string {
  try {
    return formatDateTimeMediumShort(new Date(iso));
  } catch {
    return iso;
  }
}

function sortByDeletedAtDesc<T extends { deletedAt: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
  );
}

function listRestoreTitle(item: TrashedListItem): string | undefined {
  if (item.canRestore) return undefined;
  if (item.boardDeletedAt) {
    return "Restore the board from Trash before restoring this list.";
  }
  return "This list cannot be restored right now.";
}

function taskRestoreTitle(item: TrashedTaskItem): string | undefined {
  if (item.canRestore) return undefined;
  if (item.boardDeletedAt) {
    return "Restore the board from Trash before restoring this task.";
  }
  if (item.listDeletedAt) {
    return "Restore the list from Trash before restoring this task.";
  }
  return "This task cannot be restored right now.";
}

type PurgeTarget =
  | { kind: "board"; id: number; label: string }
  | { kind: "list"; id: number; boardId: number; label: string }
  | { kind: "task"; id: number; boardId: number; label: string };

function PurgeDialog({
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  target: PurgeTarget | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const backdropDismiss = useBackdropDismissClick(onCancel, {
    disabled: busy || !target,
  });

  if (!target) return null;
  const title = "Delete permanently?";
  const message =
    target.kind === "board"
      ? `Permanently delete board “${target.label}”? This removes its lists and tasks and cannot be undone.`
      : target.kind === "list"
        ? `Permanently delete list “${target.label}”? Tasks in this list will be removed. This cannot be undone.`
        : `Permanently delete task “${target.label}”? This cannot be undone.`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onPointerDown={backdropDismiss.onPointerDown}
      onClick={backdropDismiss.onClick}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            disabled={busy}
            onClick={onConfirm}
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}

export function TrashPage() {
  const [tab, setTab] = useState<TrashTab>("boards");
  const [purgeTarget, setPurgeTarget] = useState<PurgeTarget | null>(null);

  const boardsQ = useTrashedBoards();
  const listsQ = useTrashedLists();
  const tasksQ = useTrashedTasks();

  const restoreBoard = useRestoreBoard();
  const restoreList = useRestoreList();
  const restoreTask = useRestoreTask();
  const purgeBoard = usePurgeBoard();
  const purgeList = usePurgeList();
  const purgeTask = usePurgeTask();

  const sortedBoards = useMemo(
    () => sortByDeletedAtDesc(boardsQ.data ?? []),
    [boardsQ.data],
  );
  const sortedLists = useMemo(
    () => sortByDeletedAtDesc(listsQ.data ?? []),
    [listsQ.data],
  );
  const sortedTasks = useMemo(
    () => sortByDeletedAtDesc(tasksQ.data ?? []),
    [tasksQ.data],
  );

  const actionError = useMemo(() => {
    const candidates = [
      restoreBoard.error,
      restoreList.error,
      restoreTask.error,
      purgeBoard.error,
      purgeList.error,
      purgeTask.error,
    ];
    const first = candidates.find((e) => e != null);
    return first instanceof Error ? first.message : first ? String(first) : null;
  }, [
    restoreBoard.error,
    restoreList.error,
    restoreTask.error,
    purgeBoard.error,
    purgeList.error,
    purgeTask.error,
  ]);

  const anyBusy =
    restoreBoard.isPending ||
    restoreList.isPending ||
    restoreTask.isPending ||
    purgeBoard.isPending ||
    purgeList.isPending ||
    purgeTask.isPending;

  const runPurge = useCallback(() => {
    if (!purgeTarget) return;
    if (purgeTarget.kind === "board") {
      purgeBoard.mutate(purgeTarget.id, {
        onSuccess: () => setPurgeTarget(null),
      });
    } else if (purgeTarget.kind === "list") {
      purgeList.mutate(
        { listId: purgeTarget.id, boardId: purgeTarget.boardId },
        { onSuccess: () => setPurgeTarget(null) },
      );
    } else {
      purgeTask.mutate(
        { taskId: purgeTarget.id, boardId: purgeTarget.boardId },
        { onSuccess: () => setPurgeTarget(null) },
      );
    }
  }, [purgeBoard, purgeList, purgeTask, purgeTarget]);

  const activeQuery =
    tab === "boards" ? boardsQ : tab === "lists" ? listsQ : tasksQ;

  return (
    <div className="mx-auto flex min-h-0 max-w-4xl flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Trash
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Restore items to the board, or delete them permanently. The board view
          only shows active boards, lists, and tasks.
        </p>
      </div>

      {actionError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1">
        {(
          [
            ["boards", "Boards", boardsQ] as const,
            ["lists", "Lists", listsQ] as const,
            ["tasks", "Tasks", tasksQ] as const,
          ] as const
        ).map(([id, label, q]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab(id)}
          >
            {label}
            {q.data != null ? (
              <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">
                {formatInteger(q.data.length)}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {activeQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : activeQuery.isError ? (
        <p className="text-sm text-destructive">
          {activeQuery.error instanceof Error
            ? activeQuery.error.message
            : "Failed to load Trash."}
        </p>
      ) : tab === "boards" ? (
        <TrashBoardsTable
          rows={sortedBoards}
          busy={anyBusy}
          restoreBoard={restoreBoard}
          purgeBoard={purgeBoard}
          onRequestPurge={(row: TrashedBoardItem) =>
            setPurgeTarget({
              kind: "board",
              id: row.boardId,
              label: boardDisplayName(row),
            })
          }
        />
      ) : tab === "lists" ? (
        <TrashListsTable
          rows={sortedLists}
          busy={anyBusy}
          restoreList={restoreList}
          purgeList={purgeList}
          onRequestPurge={(row: TrashedListItem) =>
            setPurgeTarget({
              kind: "list",
              id: row.listId,
              boardId: row.boardId,
              label: listDisplayName({
                listId: row.listId,
                name: row.name,
                emoji: row.emoji,
                order: 0,
              }),
            })
          }
        />
      ) : (
        <TrashTasksTable
          rows={sortedTasks}
          busy={anyBusy}
          restoreTask={restoreTask}
          purgeTask={purgeTask}
          onRequestPurge={(row: TrashedTaskItem) =>
            setPurgeTarget({
              kind: "task",
              id: row.taskId,
              boardId: row.boardId,
              label: taskDisplayTitle({
                taskId: row.taskId,
                listId: row.listId,
                title: row.title,
                body: "",
                groupId: 0,
                priorityId: 0,
                status: "",
                order: 0,
                emoji: row.emoji,
                createdAt: "",
                updatedAt: "",
              }),
            })
          }
        />
      )}

      <PurgeDialog
        target={purgeTarget}
        busy={purgeBoard.isPending || purgeList.isPending || purgeTask.isPending}
        onCancel={() => {
          if (!purgeBoard.isPending && !purgeList.isPending && !purgeTask.isPending) {
            setPurgeTarget(null);
          }
        }}
        onConfirm={runPurge}
      />
    </div>
  );
}

function TrashBoardsTable({
  rows,
  busy,
  restoreBoard,
  purgeBoard,
  onRequestPurge,
}: {
  rows: TrashedBoardItem[];
  busy: boolean;
  restoreBoard: ReturnType<typeof useRestoreBoard>;
  purgeBoard: ReturnType<typeof usePurgeBoard>;
  onRequestPurge: (row: TrashedBoardItem) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No boards in Trash.</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Board</th>
            <th className="px-3 py-2">Moved to Trash</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const label = boardDisplayName(row);
            const restoring =
              restoreBoard.isPending && restoreBoard.variables === row.boardId;
            const purging =
              purgeBoard.isPending && purgeBoard.variables === row.boardId;
            return (
              <tr key={row.boardId} className="bg-card">
                <td className="px-3 py-2 font-medium text-foreground">{label}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatDeletedAt(row.deletedAt)}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      disabled={busy}
                      title="Return this board to the active board list"
                      onClick={() => restoreBoard.mutate(row.boardId)}
                    >
                      {restoring ? "…" : "Restore"}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-destructive/50 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => onRequestPurge(row)}
                    >
                      {purging ? "…" : "Delete permanently"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TrashListsTable({
  rows,
  busy,
  restoreList,
  purgeList,
  onRequestPurge,
}: {
  rows: TrashedListItem[];
  busy: boolean;
  restoreList: ReturnType<typeof useRestoreList>;
  purgeList: ReturnType<typeof usePurgeList>;
  onRequestPurge: (row: TrashedListItem) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No lists in Trash.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[42rem] text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">List</th>
            <th className="px-3 py-2">Board</th>
            <th className="px-3 py-2">Moved to Trash</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const listLabel = listDisplayName({
              listId: row.listId,
              name: row.name,
              emoji: row.emoji,
              order: 0,
            });
            const restoring =
              restoreList.isPending && restoreList.variables === row.listId;
            const purging =
              purgeList.isPending &&
              purgeList.variables?.listId === row.listId;
            const restoreTitle = listRestoreTitle(row);
            return (
              <tr key={row.listId} className="bg-card">
                <td className="px-3 py-2 font-medium text-foreground">
                  {listLabel}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{row.boardName}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatDeletedAt(row.deletedAt)}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      disabled={busy || !row.canRestore}
                      title={restoreTitle}
                      onClick={() => restoreList.mutate(row.listId)}
                    >
                      {restoring ? "…" : "Restore"}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-destructive/50 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => onRequestPurge(row)}
                    >
                      {purging ? "…" : "Delete permanently"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TrashTasksTable({
  rows,
  busy,
  restoreTask,
  purgeTask,
  onRequestPurge,
}: {
  rows: TrashedTaskItem[];
  busy: boolean;
  restoreTask: ReturnType<typeof useRestoreTask>;
  purgeTask: ReturnType<typeof usePurgeTask>;
  onRequestPurge: (row: TrashedTaskItem) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks in Trash.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[48rem] text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Task</th>
            <th className="px-3 py-2">Board / list</th>
            <th className="px-3 py-2">Moved to Trash</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const taskLabel = taskDisplayTitle({
              taskId: row.taskId,
              listId: row.listId,
              title: row.title,
              body: "",
              groupId: 0,
              priorityId: 0,
              status: "",
              order: 0,
              emoji: row.emoji,
              createdAt: "",
              updatedAt: "",
            });
            const restoring =
              restoreTask.isPending && restoreTask.variables === row.taskId;
            const purging =
              purgeTask.isPending && purgeTask.variables?.taskId === row.taskId;
            const restoreTitle = taskRestoreTitle(row);
            return (
              <tr key={row.taskId} className="bg-card">
                <td className="px-3 py-2 font-medium text-foreground">
                  {taskLabel}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  <span className="text-foreground">{row.boardName}</span>
                  <span className="text-muted-foreground"> · </span>
                  {row.listName}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatDeletedAt(row.deletedAt)}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      disabled={busy || !row.canRestore}
                      title={restoreTitle}
                      onClick={() => restoreTask.mutate(row.taskId)}
                    >
                      {restoring ? "…" : "Restore"}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-destructive/50 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => onRequestPurge(row)}
                    >
                      {purging ? "…" : "Delete permanently"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
