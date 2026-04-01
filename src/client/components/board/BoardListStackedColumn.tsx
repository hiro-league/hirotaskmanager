import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ALL_TASK_GROUPS,
  groupLabelForId,
  type Board,
  type List,
  type Task,
} from "../../../shared/models";
import { useCreateTask, useUpdateTask } from "@/api/mutations";
import { useStatuses, useStatusWorkflowOrder } from "@/api/queries";
import { TaskCard } from "@/components/task/TaskCard";
import { TaskEditor } from "@/components/task/TaskEditor";
import { useBoardTaskKeyboardBridge } from "@/components/board/shortcuts/BoardTaskKeyboardBridge";
import { ListHeader } from "@/components/list/ListHeader";
import {
  type TaskCardViewMode,
  usePreferencesStore,
  useResolvedActiveTaskGroup,
  useResolvedTaskCardViewMode,
} from "@/store/preferences";
import { cn } from "@/lib/utils";
import {
  boardListColumnOverlayShellClass,
  stackedListColumnMinHeightClass,
} from "./boardDragOverlayShell";
import { parseTaskSortableId, sortableListId } from "./dndIds";
import {
  listTasksMergedSorted,
  visibleStatusesForBoard,
} from "./boardStatusUtils";
import { SortableTaskRow } from "./SortableTaskRow";
import { scrollElementToBottomThen } from "./useVerticalScrollOverflow";

interface ListStackedBodyProps {
  board: Board;
  list: List;
  listId: number;
  visibleStatuses: string[];
  workflowOrder: readonly string[];
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  sortableIds?: string[];
  /** Container id for this list's task droppable. */
  taskContainerId?: string;
  /** List-column DragOverlay clone: fill shell height like lanes (flex-1 body). */
  forDragOverlay?: boolean;
}

const EMPTY_SORTABLE_IDS: string[] = [];

/** Per-row component that derives stable callbacks from task id */
const StackedSortableTaskRowById = memo(function StackedSortableTaskRowById({
  sid,
  task,
  taskGroups,
  viewMode,
  onComplete,
  onEdit,
}: {
  sid: string;
  task: Task;
  taskGroups: Board["taskGroups"];
  viewMode: TaskCardViewMode;
  onComplete: (taskId: number) => void;
  onEdit: (taskId: number) => void;
}) {
  const handleOpen = useCallback(() => onEdit(task.id), [onEdit, task.id]);
  const handleComplete = useCallback(
    () => onComplete(task.id),
    [onComplete, task.id],
  );
  return (
    <SortableTaskRow
      sortableId={sid}
      task={task}
      viewMode={viewMode}
      groupLabel={groupLabelForId(taskGroups, task.groupId)}
      onOpen={handleOpen}
      onCompleteFromCircle={task.status === "open" ? handleComplete : undefined}
    />
  );
});

// Memoized to prevent re-rendering the entire list on unrelated drag-over events
const StackedSortableList = memo(function StackedSortableList({
  taskMap,
  taskGroups,
  viewMode,
  containerId,
  sortableIds,
  onComplete,
  onEdit,
}: {
  taskMap: Map<number, Task>;
  taskGroups: Board["taskGroups"];
  viewMode: TaskCardViewMode;
  containerId: string;
  sortableIds: string[];
  onComplete: (taskId: number) => void;
  onEdit: (taskId: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-8 flex-col gap-2 rounded-md",
        isOver && "bg-primary/[0.07] ring-1 ring-primary/15",
      )}
    >
      <SortableContext
        id={containerId}
        items={sortableIds}
        strategy={verticalListSortingStrategy}
      >
        {sortableIds.map((sid) => {
          const tid = parseTaskSortableId(sid);
          const task = tid != null ? taskMap.get(tid) : undefined;
          if (!task) return null;
          return (
            <StackedSortableTaskRowById
              key={sid}
              sid={sid}
              task={task}
              taskGroups={taskGroups}
              viewMode={viewMode}
              onComplete={onComplete}
              onEdit={onEdit}
            />
          );
        })}
      </SortableContext>
    </div>
  );
});

function ListStackedBody({
  board,
  list,
  listId,
  visibleStatuses,
  workflowOrder,
  dragAttributes,
  dragListeners,
  sortableIds = EMPTY_SORTABLE_IDS,
  taskContainerId,
  forDragOverlay = false,
}: ListStackedBodyProps) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { data: statuses } = useStatuses();
  const activeGroup = useResolvedActiveTaskGroup(board.id, board.taskGroups);
  const taskCardViewMode = useResolvedTaskCardViewMode(board.id);
  const headerCollapsed = usePreferencesStore((s) => s.boardFilterStripCollapsed);

  // O(1) task lookup map
  const taskMap = useMemo(() => {
    const m = new Map<number, Task>();
    for (const t of board.tasks) m.set(t.id, t);
    return m;
  }, [board.tasks]);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const addCardRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const createPendingRef = useRef(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [bodyMaxHeight, setBodyMaxHeight] = useState<number | null>(null);
  createPendingRef.current = createTask.isPending;

  const resolvedEditTask =
    editingTask !== null
      ? (taskMap.get(editingTask.id) ?? editingTask)
      : null;
  const editTaskResolved = editingTaskId != null ? (taskMap.get(editingTaskId) ?? null) : null;

  // Stable callback refs for use inside memoized children
  const boardRef = useRef(board);
  boardRef.current = board;
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  const handleComplete = useCallback(
    (taskId: number) => {
      const t = boardRef.current.tasks.find((x) => x.id === taskId);
      if (!t) return;
      const closedId =
        statusesRef.current?.find((s) => s.isClosed)?.id ?? "closed";
      const now = new Date().toISOString();
      updateTask.mutate({
        boardId: boardRef.current.id,
        task: {
          ...t,
          status: closedId,
          updatedAt: now,
          closedAt: t.closedAt ?? now,
        },
      });
    },
    [updateTask],
  );

  const handleEdit = useCallback((taskId: number) => {
    setEditingTaskId(taskId);
  }, []);

  const { registerOpenTaskEditor } = useBoardTaskKeyboardBridge();
  useEffect(() => {
    return registerOpenTaskEditor((taskId) => {
      const t = board.tasks.find((x) => x.id === taskId);
      if (!t || t.listId !== list.id) return false;
      setEditingTaskId(taskId);
      return true;
    });
  }, [board.tasks, list.id, registerOpenTaskEditor]);

  useEffect(() => {
    if (!adding) return;
    inputRef.current?.focus();
  }, [adding]);

  const cancelAdd = () => {
    setAdding(false);
    setTitle("");
  };

  const openComposerAtBottom = () => {
    // The composer adds extra height after mount, so do a second bottom snap
    // once the textarea + actions exist to avoid landing midway down the list.
    scrollElementToBottomThen(scrollRef.current, () => {
      setAdding(true);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const scrollEl = scrollRef.current;
          if (!scrollEl) return;
          scrollEl.scrollTop = scrollEl.scrollHeight;
          inputRef.current?.focus();
        });
      });
    });
  };

  const focusComposerAtBottom = () => {
    // After creating another task, snap back to the list bottom before refocusing.
    window.requestAnimationFrame(() => {
      scrollElementToBottomThen(scrollRef.current, () => {
        window.setTimeout(() => inputRef.current?.focus(), 0);
      });
    });
  };

  const submitTask = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const defaultGroupId =
      activeGroup !== ALL_TASK_GROUPS
        ? Number(activeGroup)
        : board.taskGroups[0]?.id ?? 0;
    createTask.mutate(
      {
        boardId: board.id,
        listId: list.id,
        status: quickAddStatus,
        title: trimmed,
        body: "",
        groupId: defaultGroupId,
      },
      {
        onSuccess: () => {
          setTitle("");
          focusComposerAtBottom();
        },
      },
    );
  };

  const handleTextareaBlur = () => {
    window.setTimeout(() => {
      if (createPendingRef.current) return;
      const active = document.activeElement;
      if (
        addCardRef.current &&
        active instanceof Node &&
        addCardRef.current.contains(active)
      ) {
        return;
      }
      cancelAdd();
    }, 0);
  };

  const quickAddStatus =
    workflowOrder.includes("open") ? "open" : (workflowOrder[0] ?? "open");
  const canAddOpen = visibleStatuses.includes(quickAddStatus);

  const staticTasks = useMemo(
    () =>
      taskContainerId != null
        ? null
        : listTasksMergedSorted(board, listId, visibleStatuses, activeGroup, workflowOrder),
    [taskContainerId, board, listId, visibleStatuses, activeGroup, workflowOrder],
  );

  // Show FAB whenever the add-task button is scrolled out of view.
  // IntersectionObserver fires on every scroll/resize; no layout mutation needed.
  const [addBtnVisible, setAddBtnVisible] = useState(true);

  useEffect(() => {
    if (!canAddOpen || adding || forDragOverlay) {
      setAddBtnVisible(true);
      return;
    }
    const target = addBtnRef.current;
    const root = scrollRef.current;
    if (!target || !root) return;

    const io = new IntersectionObserver(
      ([entry]) => setAddBtnVisible(entry.isIntersecting),
      { root, threshold: 1.0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [canAddOpen, adding, forDragOverlay]);

  const showFab = canAddOpen && !adding && !addBtnVisible && !forDragOverlay;

  useEffect(() => {
    if (forDragOverlay) {
      setBodyMaxHeight(null);
      return;
    }

    const updateBodyMaxHeight = () => {
      if (typeof window === "undefined") return;
      const el = outerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const bottomGap = 32;
      const next = Math.max(240, Math.floor(window.innerHeight - top - bottomGap));
      setBodyMaxHeight(next);
    };

    updateBodyMaxHeight();
    const rafId = window.requestAnimationFrame(updateBodyMaxHeight);
    window.addEventListener("resize", updateBodyMaxHeight);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateBodyMaxHeight);
    };
  }, [forDragOverlay, headerCollapsed]);

  const outerClass = cn(
    "relative flex flex-col overflow-hidden bg-muted/20",
    forDragOverlay && "min-h-0 flex-1",
  );

  const outerStyle =
    !forDragOverlay && bodyMaxHeight != null
      ? { maxHeight: `${bodyMaxHeight}px` }
      : undefined;

  const main = (
    <>
      <ListHeader
        boardId={board.id}
        list={list}
        dragAttributes={dragAttributes}
        dragListeners={dragListeners}
      />
      <div ref={outerRef} className={outerClass} style={outerStyle}>
        {/* Scroll container — FAB lives outside this div so it never scrolls */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 pb-4 pt-2"
          data-board-id={board.id}
          data-list-id={listId}
          aria-label={`${list.name} — tasks`}
        >
          <div className="flex flex-col gap-2">
            {taskContainerId != null ? (
              <StackedSortableList
                taskMap={taskMap}
                taskGroups={board.taskGroups}
                viewMode={taskCardViewMode}
                containerId={taskContainerId}
                sortableIds={sortableIds}
                onComplete={handleComplete}
                onEdit={handleEdit}
              />
            ) : (
              <>
                {staticTasks?.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    viewMode={taskCardViewMode}
                    groupLabel={groupLabelForId(board.taskGroups, task.groupId)}
                    onOpen={() => setEditingTask(task)}
                  />
                ))}
              </>
            )}

            {/* Add-task button — always rendered so IntersectionObserver can watch it */}
            {canAddOpen && !adding && (
              <button
                ref={addBtnRef}
                type="button"
                className="mt-2 flex w-full shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:bg-muted/50 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  openComposerAtBottom();
                }}
              >
                <Plus className="size-3.5" aria-hidden />
                Add task
              </button>
            )}

            {/* Composer */}
            {canAddOpen && adding && (
              <div
                ref={addCardRef}
                className="mt-2 shrink-0 rounded-md border border-border bg-background p-2 shadow-sm"
                onClick={(e) => e.stopPropagation()}
              >
                {/* This composer intentionally restores selection inside the board's non-selectable drag surface. */}
                <textarea
                  ref={inputRef}
                  rows={3}
                  className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground select-text"
                  placeholder="Enter a title or paste a link"
                  value={title}
                  disabled={createTask.isPending}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={handleTextareaBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitTask();
                    }
                    if (e.key === "Escape") cancelAdd();
                  }}
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    disabled={createTask.isPending || !title.trim()}
                    onClick={() => submitTask()}
                  >
                    Add task
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Cancel"
                    disabled={createTask.isPending}
                    onClick={cancelAdd}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FAB — sibling of scroll div, anchored to outer shell, never scrolls */}
        {showFab && (
          <button
            type="button"
            aria-label="Add task"
            className={cn(
              "absolute bottom-3 right-3 z-10",
              "flex size-11 shrink-0 items-center justify-center rounded-full",
              "bg-primary text-primary-foreground shadow-md ring-1 ring-border/60",
              // Match lanes: keep the FAB hidden until this stacked list is hovered.
              "opacity-0 pointer-events-none transition-opacity duration-150",
              "group-hover/list-col:opacity-100 group-hover/list-col:pointer-events-auto",
              "hover:opacity-90",
              "focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
            onClick={(e) => {
              e.stopPropagation();
              openComposerAtBottom();
            }}
          >
            <Plus className="size-6" strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>
    </>
  );

  if (forDragOverlay) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {main}
      </div>
    );
  }

  return (
    <>
      {main}
      <TaskEditor
        board={board}
        open={editingTask !== null || editingTaskId !== null}
        onClose={() => { setEditingTask(null); setEditingTaskId(null); }}
        mode="edit"
        task={resolvedEditTask ?? editTaskResolved ?? undefined}
      />
    </>
  );
}

export interface BoardListStackedColumnOverlayProps {
  board: Board;
  listId: number;
}

export function BoardListStackedColumnOverlay({
  board,
  listId,
}: BoardListStackedColumnOverlayProps) {
  const workflowOrder = useStatusWorkflowOrder();
  const list = board.lists.find((l) => l.id === listId);
  if (!list) return null;
  const visibleStatuses = visibleStatusesForBoard(board, workflowOrder);
  return (
    <div className={boardListColumnOverlayShellClass}>
      <ListStackedBody
        board={board}
        list={list}
        listId={listId}
        visibleStatuses={visibleStatuses}
        workflowOrder={workflowOrder}
        forDragOverlay
      />
    </div>
  );
}

interface BoardListStackedColumnProps {
  board: Board;
  listId: number;
  taskContainerId: string;
  sortableIds: string[];
}

// Memoized: only re-renders when this column's props actually change
export const BoardListStackedColumn = memo(function BoardListStackedColumn({
  board,
  listId,
  taskContainerId,
  sortableIds,
}: BoardListStackedColumnProps) {
  const workflowOrder = useStatusWorkflowOrder();
  const visibleStatuses = useMemo(
    () => visibleStatusesForBoard(board, workflowOrder),
    [board, workflowOrder],
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableListId(listId) });

  const list = board.lists.find((l) => l.id === listId);
  if (!list) return null;

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex w-72 shrink-0 flex-col self-start",
        isDragging && stackedListColumnMinHeightClass,
      )}
      data-list-column={list.id}
      data-board-no-pan
    >
      <div
        className={cn(
          // Mirror lane columns so hover-only controls stay scoped to the active list.
          "group/list-col flex flex-col overflow-hidden rounded-lg border bg-list-column shadow-sm transition-[opacity,border-color]",
          isDragging
            ? "min-h-0 flex-1 border-2 border-dashed border-primary/20 bg-muted/30 shadow-none"
            : "border-border",
        )}
      >
        {!isDragging && (
          <ListStackedBody
            board={board}
            list={list}
            listId={listId}
            visibleStatuses={visibleStatuses}
            workflowOrder={workflowOrder}
            dragAttributes={attributes}
            dragListeners={listeners}
            taskContainerId={taskContainerId}
            sortableIds={sortableIds}
          />
        )}
      </div>
    </div>
  );
});
