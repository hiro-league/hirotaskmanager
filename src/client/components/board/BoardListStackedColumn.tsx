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
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { ListHeader } from "@/components/list/ListHeader";
import { usePreferencesStore, useResolvedActiveTaskGroup } from "@/store/preferences";
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
  stackedTaskMap?: Record<string, string[]>;
  /** Container id for this list's task droppable. */
  taskContainerId?: string;
  /** List-column DragOverlay clone: fill shell height like lanes (flex-1 body). */
  forDragOverlay?: boolean;
}

function StackedSortableList({
  board,
  containerId,
  sortableIds,
  completeFromList,
  setEditingTask,
}: {
  board: Board;
  containerId: string;
  sortableIds: string[];
  completeFromList: (t: Task) => void;
  setEditingTask: (t: Task) => void;
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
        // Pin the sortable container id to the list so dnd-kit does not
        // recycle container identity during cross-list task moves.
        id={containerId}
        items={sortableIds}
        strategy={verticalListSortingStrategy}
      >
        {sortableIds.map((sid) => {
          const tid = parseTaskSortableId(sid);
          const task =
            tid != null ? board.tasks.find((t) => t.id === tid) : undefined;
          if (!task) return null;
          return (
            <SortableTaskRow
              key={sid}
              sortableId={sid}
              task={task}
              groupLabel={groupLabelForId(board.taskGroups, task.groupId)}
              onOpen={() => setEditingTask(task)}
              onCompleteFromCircle={
                task.status === "open"
                  ? () => completeFromList(task)
                  : undefined
              }
            />
          );
        })}
      </SortableContext>
    </div>
  );
}

function ListStackedBody({
  board,
  list,
  listId,
  visibleStatuses,
  workflowOrder,
  dragAttributes,
  dragListeners,
  stackedTaskMap = {},
  taskContainerId,
  forDragOverlay = false,
}: ListStackedBodyProps) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { data: statuses } = useStatuses();
  const activeGroup = useResolvedActiveTaskGroup(board.id, board.taskGroups);
  const headerCollapsed = usePreferencesStore((s) => s.boardFilterStripCollapsed);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const addCardRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const createPendingRef = useRef(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [bodyMaxHeight, setBodyMaxHeight] = useState<number | null>(null);
  createPendingRef.current = createTask.isPending;

  const resolvedEditTask =
    editingTask !== null
      ? (board.tasks.find((t) => t.id === editingTask.id) ?? editingTask)
      : null;

  const completeFromList = (t: Task) => {
    const closedId = statuses?.find((s) => s.isClosed)?.id ?? "closed";
    const now = new Date().toISOString();
    updateTask.mutate({
      boardId: board.id,
      task: {
        ...t,
        status: closedId,
        updatedAt: now,
        closedAt: t.closedAt ?? now,
      },
    });
  };

  useEffect(() => {
    if (!adding) return;
    inputRef.current?.focus();
  }, [adding]);

  const cancelAdd = () => {
    setAdding(false);
    setTitle("");
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
          window.setTimeout(() => inputRef.current?.focus(), 0);
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

  const sortableIds =
    taskContainerId != null ? (stackedTaskMap[taskContainerId] ?? []) : [];

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
    "relative flex flex-col overflow-hidden bg-muted/20 dark:bg-muted/10",
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
                board={board}
                containerId={taskContainerId}
                sortableIds={sortableIds}
                completeFromList={completeFromList}
                setEditingTask={setEditingTask}
              />
            ) : (
              <>
                {staticTasks?.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
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
                  setAdding(true);
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
                <textarea
                  ref={inputRef}
                  rows={3}
                  className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
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
            className="absolute bottom-3 right-3 z-10 flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-1 ring-border/60 hover:opacity-90"
            onClick={(e) => {
              e.stopPropagation();
              scrollElementToBottomThen(scrollRef.current, () => setAdding(true));
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
        open={editingTask !== null}
        onClose={() => setEditingTask(null)}
        mode="edit"
        task={resolvedEditTask ?? undefined}
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
  stackedTaskMap: Record<string, string[]>;
  taskContainerId: string;
}

export function BoardListStackedColumn({
  board,
  listId,
  stackedTaskMap,
  taskContainerId,
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
          "flex flex-col overflow-hidden rounded-lg border bg-list-column shadow-sm transition-[opacity,border-color]",
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
            stackedTaskMap={stackedTaskMap}
            taskContainerId={taskContainerId}
          />
        )}
      </div>
    </div>
  );
}
