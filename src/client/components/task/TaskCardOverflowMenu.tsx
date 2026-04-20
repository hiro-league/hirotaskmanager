import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { createPortal } from "react-dom";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleDot,
  Copy,
  Flag,
  ListTree,
  MoreVertical,
  Pencil,
  Rocket,
  Star,
  Tags,
  Trash2,
} from "lucide-react";
import {
  formatGroupDisplayLabel,
  listDisplayName,
  priorityDisplayLabel,
  sortPrioritiesByValue,
  sortTaskGroupsForDisplay,
  taskDisplayTitle,
  type Task,
} from "../../../shared/models";
import { sortReleasesForDisplay } from "../../../shared/releaseSort";
import type { TaskCardOverflowBoardData } from "@/components/board/boardColumnData";
import { useDeleteTask, useMoveTask, useUpdateTask } from "@/api/mutations";
import { useStatuses, useStatusWorkflowOrder } from "@/api/queries";
import { CursorMarkIcon } from "@/components/brand/CursorMarkIcon";
import { ConfirmDialog } from "@/components/board/shortcuts/ConfirmDialog";
import { useBoardKeyboardNavOptional } from "@/components/board/shortcuts/BoardKeyboardNavContext";
import { useBoardTaskCompletionCelebrationOptional } from "@/gamification";
import {
  buildHiroAgentPromptText,
  copyTextToClipboard,
  CURSOR_AGENT_PROMPT_URL_MAX_LENGTH,
  cursorPromptUrlForText,
} from "@/lib/agentPrompt";
import { formatDateMedium } from "@/lib/intlDateFormat";
import { reportMutationError } from "@/lib/mutationErrorUi";
import { cn } from "@/lib/utils";
import { statusDotClass } from "@/components/board/lanes/laneStatusTheme";

function formatReleaseDateLabelForMenu(
  releaseDate: string | null | undefined,
): string | undefined {
  const raw = releaseDate?.trim();
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return formatDateMedium(d);
}

/**
 * Cap menu/sub-menu height to the viewport (Radix exposes the available height
 * via `--radix-popper-available-height`); the panel scrolls instead of being
 * clipped when there's not enough space below or to the side.
 */
const MENU_CONTENT_CLASS =
  "z-[100] min-w-[9.5rem] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-y-contain rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md";

const SUB_CONTENT_CLASS =
  "z-[100] min-w-[10rem] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-y-contain rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md";

/**
 * Keep some breathing room from the viewport edges so a flipped panel does not
 * sit flush against the scrollbars / window chrome.
 */
const MENU_COLLISION_PADDING = 8;

const ITEM_CLASS =
  "flex cursor-default items-center gap-2 rounded px-2 py-1.5 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground";

const SUB_TRIGGER_CLASS =
  "flex w-full cursor-default select-none items-center justify-between gap-2 rounded px-2 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent";

/** Leading icon + label for submenu triggers (Group / Priority / Status / Release). */
function SubTriggerLabel({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      <span>{label}</span>
    </span>
  );
}

export interface TaskCardOverflowMenuProps {
  task: Task;
  onEdit: () => void;
  /** Board metadata for overflow actions; omit to show only “Edit task”. */
  board?: TaskCardOverflowBoardData;
}

export function TaskCardOverflowMenu({
  task,
  onEdit,
  board,
}: TaskCardOverflowMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const boardNav = useBoardKeyboardNavOptional();
  const completion = useBoardTaskCompletionCelebrationOptional();

  const updateTask = useUpdateTask();
  const moveTask = useMoveTask();
  const deleteTask = useDeleteTask();
  const { data: statuses } = useStatuses();
  const workflowOrder = useStatusWorkflowOrder();

  const busy =
    updateTask.isPending || moveTask.isPending || deleteTask.isPending;

  const sortedPriorities = useMemo(
    () => (board ? sortPrioritiesByValue(board.taskPriorities) : []),
    [board],
  );

  const sortedGroups = useMemo(
    () => (board ? sortTaskGroupsForDisplay(board.taskGroups) : []),
    [board],
  );

  const releaseRows = useMemo(() => {
    if (!board) return [];
    return sortReleasesForDisplay(board.releases).map((r) => {
      const name = r.name.trim() || String(r.releaseId);
      const isDefault =
        board.defaultReleaseId != null &&
        board.defaultReleaseId === r.releaseId;
      const dateLabel = formatReleaseDateLabelForMenu(r.releaseDate);
      return {
        releaseId: r.releaseId,
        label: name,
        dateLabel,
        isDefault,
        fillColor: r.color ?? null,
      };
    });
  }, [board]);

  const sortedOtherLists = useMemo(() => {
    if (!board) return [];
    return [...board.lists]
      .filter((l) => l.listId !== task.listId)
      .sort((a, b) => a.order - b.order || a.listId - b.listId);
  }, [board, task.listId]);

  const bandOrderInfo = useMemo(() => {
    if (!board) {
      return { firstId: null as number | null, lastId: null as number | null };
    }
    const same = board.tasks.filter(
      (t) => t.listId === task.listId && t.status === task.status,
    );
    const sorted = [...same].sort(
      (a, b) => a.order - b.order || a.taskId - b.taskId,
    );
    const firstId = sorted[0]?.taskId ?? null;
    const lastId = sorted[sorted.length - 1]?.taskId ?? null;
    return { firstId, lastId };
  }, [board, task.listId, task.status, task.taskId]);

  const atBandTop = bandOrderInfo.firstId === task.taskId;
  const atBandBottom = bandOrderInfo.lastId === task.taskId;

  const closedStatusId =
    statuses?.find((s) => s.isClosed)?.statusId ?? "closed";
  const openStatusId =
    workflowOrder.find((id) => id === "open") ?? workflowOrder[0] ?? "open";
  const inProgressId =
    workflowOrder.find((id) => id === "in-progress") ?? "in-progress";

  const currentMeta = statuses?.find((s) => s.statusId === task.status);
  const isDone =
    currentMeta?.isClosed === true || task.status === closedStatusId;
  const isInProgress = task.status === inProgressId;

  const workflowBucket = isDone
    ? ("closed" as const)
    : isInProgress
      ? ("in-progress" as const)
      : ("open" as const);

  const otherWorkflowTargetIds = useMemo((): [string, string] | null => {
    if (workflowBucket === "closed") {
      return [openStatusId, inProgressId];
    }
    if (workflowBucket === "open") {
      return [closedStatusId, inProgressId];
    }
    return [closedStatusId, openStatusId];
  }, [
    workflowBucket,
    openStatusId,
    inProgressId,
    closedStatusId,
  ]);

  const statusLabelFor = useCallback(
    (statusId: string) =>
      statuses?.find((s) => s.statusId === statusId)?.label ?? statusId,
    [statuses],
  );

  const applyPatch = useCallback(
    async (
      patch: Partial<Pick<Task, "groupId" | "priorityId" | "releaseId">>,
    ) => {
      if (!board) return;
      const next: Task = { ...task };
      if (patch.groupId !== undefined) next.groupId = patch.groupId;
      if (patch.priorityId !== undefined) next.priorityId = patch.priorityId;
      if (patch.releaseId !== undefined) next.releaseId = patch.releaseId;
      try {
        await updateTask.mutateAsync({
          boardId: board.boardId,
          task: next,
        });
      } catch (err) {
        console.error("[TaskCardOverflowMenu] update task failed", err);
        reportMutationError("update task", err);
      }
    },
    [board, task, updateTask],
  );

  const applyWorkflowStatus = useCallback(
    async (nextStatusId: string) => {
      if (!board) return;
      const target = statuses?.find((s) => s.statusId === nextStatusId);
      const now = new Date().toISOString();
      const isClosing =
        target?.isClosed === true ||
        (target === undefined && nextStatusId === closedStatusId);
      const wasClosed =
        statuses?.find((s) => s.statusId === task.status)?.isClosed === true;
      if (isClosing && !wasClosed) {
        completion?.celebrateTaskCompletion({
          anchorEl: triggerRef.current ?? undefined,
        });
      }
      const nextClosedAt = isClosing ? (task.closedAt ?? now) : null;
      try {
        await updateTask.mutateAsync({
          boardId: board.boardId,
          task: {
            ...task,
            status: nextStatusId,
            updatedAt: now,
            closedAt: nextClosedAt,
          },
        });
      } catch (err) {
        console.error("[TaskCardOverflowMenu] status change failed", err);
        reportMutationError("update task", err);
      }
    },
    [
      board,
      task,
      statuses,
      closedStatusId,
      updateTask,
      completion,
    ],
  );

  const runMoveTask = useCallback(
    async (input: {
      boardId: number;
      taskId: number;
      toListId?: number;
      toStatus?: string;
      beforeTaskId?: number;
      afterTaskId?: number;
      position?: "first" | "last";
      visibleOrderedTaskIds?: number[];
    }) => {
      try {
        await moveTask.mutateAsync(input);
      } catch (err) {
        console.error("[TaskCardOverflowMenu] move task failed", err);
        reportMutationError("move task", err);
      }
    },
    [moveTask],
  );

  const confirmTrash = useCallback(() => {
    if (!board) return;
    deleteTask.mutate(
      { boardId: board.boardId, taskId: task.taskId },
      {
        onSuccess: () => {
          boardNav?.setHighlightedTaskId(null);
          setTrashConfirmOpen(false);
        },
        onError: (err) => reportMutationError("delete task", err),
      },
    );
  }, [board, boardNav, deleteTask, task.taskId]);

  const showFieldMenus = board != null;
  const showStatusMenu = showFieldMenus && otherWorkflowTargetIds != null;
  const showMoveSection = showFieldMenus;

  const agentPromptPayload = useMemo(() => {
    if (!board) return null;
    const promptText = buildHiroAgentPromptText({
      taskId: task.taskId,
      boardId: board.boardId,
      titleForDisplay: taskDisplayTitle(task),
    });
    return {
      promptText,
      cursorUrl: cursorPromptUrlForText(promptText),
    };
  }, [board, task.taskId, task.title, task.emoji]);

  return (
    <>
      <DropdownMenu.Root
        modal={false}
        onOpenChange={(open) => {
          // Trigger uses stopPropagation so card-root pointer-down never runs; align highlight with opening actions.
          if (open) boardNav?.selectTask(task.taskId);
        }}
      >
        <DropdownMenu.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none",
              "px-1 opacity-0 transition-opacity duration-150",
              "pointer-events-none hover:bg-accent/60 hover:text-foreground",
              "group-hover/task-card:pointer-events-auto group-hover/task-card:opacity-100",
              "data-[state=open]:pointer-events-auto data-[state=open]:opacity-100",
              "focus-visible:pointer-events-auto focus-visible:opacity-100",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
            )}
            aria-label="Task actions"
            title="Task actions"
            disabled={busy}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="size-4" strokeWidth={2} aria-hidden />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="right"
            align="start"
            sideOffset={4}
            collisionPadding={MENU_COLLISION_PADDING}
            className={MENU_CONTENT_CLASS}
          >
            {!showFieldMenus ? (
              <DropdownMenu.Item
                className={cn(ITEM_CLASS, "gap-2")}
                disabled={busy}
                onSelect={() => {
                  onEdit();
                }}
              >
                <Pencil className="size-3.5 shrink-0 opacity-80" aria-hidden />
                Edit task
              </DropdownMenu.Item>
            ) : null}

            {agentPromptPayload ? (
              <>
                <DropdownMenu.Item
                  className={cn(ITEM_CLASS, "gap-2")}
                  disabled={busy}
                  title="Copy Prompt"
                  onSelect={() => {
                    void copyTextToClipboard(
                      agentPromptPayload.promptText,
                    ).catch(() => {});
                  }}
                >
                  <Copy className="size-3.5 shrink-0 opacity-80" aria-hidden />
                  Copy Prompt
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={cn(ITEM_CLASS, "gap-2")}
                  disabled={busy || agentPromptPayload.cursorUrl == null}
                  title={
                    agentPromptPayload.cursorUrl == null
                      ? `Prompt too long for a Cursor link (max ${String(CURSOR_AGENT_PROMPT_URL_MAX_LENGTH)} characters in URL)`
                      : "Open in Cursor"
                  }
                  onSelect={() => {
                    const u = agentPromptPayload.cursorUrl;
                    if (u)
                      window.open(u, "_blank", "noopener,noreferrer");
                  }}
                >
                  <CursorMarkIcon
                    className="size-3.5 opacity-90"
                    innerSurface="popover"
                  />
                  Open in Cursor
                </DropdownMenu.Item>
              </>
            ) : null}

            {showFieldMenus ? (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />

                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger
                    className={SUB_TRIGGER_CLASS}
                    disabled={busy}
                  >
                    <SubTriggerLabel icon={Tags} label="Group" />
                    <ChevronRight
                      className="size-3.5 shrink-0 opacity-70"
                      aria-hidden
                    />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent
                      sideOffset={6}
                      alignOffset={-4}
                      collisionPadding={MENU_COLLISION_PADDING}
                      className={SUB_CONTENT_CLASS}
                    >
                      {sortedGroups.map((g) => {
                        const current = task.groupId === g.groupId;
                        return (
                          <DropdownMenu.Item
                            key={g.groupId}
                            className={ITEM_CLASS}
                            disabled={busy || current}
                            onSelect={() => {
                              void applyPatch({ groupId: g.groupId });
                            }}
                          >
                            {formatGroupDisplayLabel(g)}
                          </DropdownMenu.Item>
                        );
                      })}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>

                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger
                    className={SUB_TRIGGER_CLASS}
                    disabled={busy}
                  >
                    <SubTriggerLabel icon={Flag} label="Priority" />
                    <ChevronRight
                      className="size-3.5 shrink-0 opacity-70"
                      aria-hidden
                    />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent
                      sideOffset={6}
                      alignOffset={-4}
                      collisionPadding={MENU_COLLISION_PADDING}
                      className={SUB_CONTENT_CLASS}
                    >
                      {sortedPriorities.map((p) => {
                        const current = task.priorityId === p.priorityId;
                        return (
                          <DropdownMenu.Item
                            key={p.priorityId}
                            className={ITEM_CLASS}
                            disabled={busy || current}
                            onSelect={() => {
                              void applyPatch({ priorityId: p.priorityId });
                            }}
                          >
                            <span
                              className="size-2.5 shrink-0 rounded-full border border-border/80"
                              style={{ backgroundColor: p.color }}
                              aria-hidden
                            />
                            {priorityDisplayLabel(p.label)}
                          </DropdownMenu.Item>
                        );
                      })}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>

                {showStatusMenu ? (
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger
                      className={SUB_TRIGGER_CLASS}
                      disabled={busy}
                    >
                      <SubTriggerLabel icon={CircleDot} label="Status" />
                      <ChevronRight
                        className="size-3.5 shrink-0 opacity-70"
                        aria-hidden
                      />
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.SubContent
                        sideOffset={6}
                        alignOffset={-4}
                        collisionPadding={MENU_COLLISION_PADDING}
                        className={SUB_CONTENT_CLASS}
                      >
                        {otherWorkflowTargetIds.map((sid) => (
                          <DropdownMenu.Item
                            key={sid}
                            className={ITEM_CLASS}
                            disabled={busy || task.status === sid}
                            onSelect={() => {
                              void applyWorkflowStatus(sid);
                            }}
                          >
                            {/* Dot colors match `laneStatusTheme` / header status toggles (not “Set to …” copy). */}
                            <span
                              className={cn(
                                "size-2.5 shrink-0 rounded-full border border-border/80",
                                statusDotClass(sid),
                              )}
                              aria-hidden
                            />
                            {statusLabelFor(sid)}
                          </DropdownMenu.Item>
                        ))}
                      </DropdownMenu.SubContent>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Sub>
                ) : null}

                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger
                    className={SUB_TRIGGER_CLASS}
                    disabled={busy}
                  >
                    <SubTriggerLabel icon={Rocket} label="Release" />
                    <ChevronRight
                      className="size-3.5 shrink-0 opacity-70"
                      aria-hidden
                    />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent
                      sideOffset={6}
                      alignOffset={-4}
                      collisionPadding={MENU_COLLISION_PADDING}
                      className={SUB_CONTENT_CLASS}
                    >
                      {releaseRows.map((r) => {
                        const current = task.releaseId === r.releaseId;
                        return (
                          <DropdownMenu.Item
                            key={r.releaseId}
                            className={ITEM_CLASS}
                            disabled={busy || current}
                            onSelect={() => {
                              void applyPatch({ releaseId: r.releaseId });
                            }}
                          >
                            <span
                              className="size-2.5 shrink-0 rounded-full border border-border/80"
                              style={
                                r.fillColor
                                  ? { backgroundColor: r.fillColor }
                                  : undefined
                              }
                              aria-hidden
                            />
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="min-w-0 truncate">
                                  {r.label}
                                </span>
                                {r.isDefault ? (
                                  <span
                                    className="inline-flex shrink-0"
                                    title="Board default release"
                                    aria-label="Board default release"
                                  >
                                    <Star
                                      className="size-3 fill-yellow-400 text-yellow-600"
                                      strokeWidth={1.75}
                                      aria-hidden
                                    />
                                  </span>
                                ) : null}
                              </span>
                              {r.dateLabel ? (
                                <span className="text-[11px] tabular-nums text-muted-foreground">
                                  {r.dateLabel}
                                </span>
                              ) : null}
                            </span>
                          </DropdownMenu.Item>
                        );
                      })}
                      <DropdownMenu.Item
                        className={ITEM_CLASS}
                        disabled={busy || task.releaseId == null}
                        onSelect={() => {
                          void applyPatch({ releaseId: null });
                        }}
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-full border border-dashed border-muted-foreground/50"
                          aria-hidden
                        />
                        Unassigned
                      </DropdownMenu.Item>
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>

                {showMoveSection ? (
                  <>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <DropdownMenu.Item
                      className={cn(ITEM_CLASS, "gap-2")}
                      disabled={busy || atBandTop}
                      onSelect={() => {
                        void runMoveTask({
                          boardId: board.boardId,
                          taskId: task.taskId,
                          position: "first",
                        });
                      }}
                    >
                      <ArrowUp
                        className="size-3.5 shrink-0 opacity-80"
                        aria-hidden
                      />
                      Move to top
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={cn(ITEM_CLASS, "gap-2")}
                      disabled={busy || atBandBottom}
                      onSelect={() => {
                        void runMoveTask({
                          boardId: board.boardId,
                          taskId: task.taskId,
                          position: "last",
                        });
                      }}
                    >
                      <ArrowDown
                        className="size-3.5 shrink-0 opacity-80"
                        aria-hidden
                      />
                      Move to bottom
                    </DropdownMenu.Item>
                    {sortedOtherLists.length > 0 ? (
                      <DropdownMenu.Sub>
                        <DropdownMenu.SubTrigger
                          className={SUB_TRIGGER_CLASS}
                          disabled={busy}
                        >
                          <SubTriggerLabel icon={ListTree} label="Move to List" />
                          <ChevronRight
                            className="size-3.5 shrink-0 opacity-70"
                            aria-hidden
                          />
                        </DropdownMenu.SubTrigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.SubContent
                            sideOffset={6}
                            alignOffset={-4}
                            collisionPadding={MENU_COLLISION_PADDING}
                            className={SUB_CONTENT_CLASS}
                          >
                            {sortedOtherLists.map((l) => (
                              <DropdownMenu.Item
                                key={l.listId}
                                className={ITEM_CLASS}
                                disabled={busy}
                                onSelect={() => {
                                  void runMoveTask({
                                    boardId: board.boardId,
                                    taskId: task.taskId,
                                    toListId: l.listId,
                                  });
                                }}
                              >
                                {listDisplayName(l)}
                              </DropdownMenu.Item>
                            ))}
                          </DropdownMenu.SubContent>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Sub>
                    ) : null}
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <DropdownMenu.Item
                      className={cn(ITEM_CLASS, "gap-2")}
                      disabled={busy}
                      onSelect={() => {
                        onEdit();
                      }}
                    >
                      <Pencil className="size-3.5 shrink-0 opacity-80" aria-hidden />
                      Edit task
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={cn(
                        ITEM_CLASS,
                        "gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive",
                      )}
                      disabled={busy}
                      onSelect={() => {
                        setTrashConfirmOpen(true);
                      }}
                    >
                      <Trash2 className="size-3.5 shrink-0 opacity-90" aria-hidden />
                      Move to Trash
                    </DropdownMenu.Item>
                  </>
                ) : null}
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {board
        ? createPortal(
            // Task card uses `overflow-hidden`; `ConfirmDialog` is `fixed` and would be clipped
            // in the card’s box. Portaling to `document.body` keeps a real full-viewport modal.
            <ConfirmDialog
              open={trashConfirmOpen}
              scope="task-delete-confirmation"
              title="Move this task to Trash?"
              message={`Move “${taskDisplayTitle(task)}” to Trash? You can restore from Trash or delete permanently there.`}
              confirmLabel="Move to Trash"
              cancelLabel="Cancel"
              variant="destructive"
              onCancel={() => setTrashConfirmOpen(false)}
              onConfirm={confirmTrash}
            />,
            document.body,
          )
        : null}
    </>
  );
}
