import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ALL_TASK_GROUPS,
  groupLabelForId,
  type Board,
  type List,
  type Task,
} from "../../../shared/models";
import { useCreateTask } from "@/api/mutations";
import { useStatusWorkflowOrder } from "@/api/queries";
import { TaskCard } from "@/components/task/TaskCard";
import { TaskEditor } from "@/components/task/TaskEditor";
import { ListHeader } from "@/components/list/ListHeader";
import { useResolvedActiveTaskGroup } from "@/store/preferences";
import { cn } from "@/lib/utils";
import {
  listTasksMergedSorted,
  visibleStatusesForBoard,
} from "./boardStatusUtils";

interface ListStackedBodyProps {
  board: Board;
  list: List;
  listId: number;
  visibleStatuses: string[];
  workflowOrder: readonly string[];
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
}

function ListStackedBody({
  board,
  list,
  listId,
  visibleStatuses,
  workflowOrder,
  dragAttributes,
  dragListeners,
}: ListStackedBodyProps) {
  const createTask = useCreateTask();
  const activeGroup = useResolvedActiveTaskGroup(board.id, board.taskGroups);

  const tasks = useMemo(
    () =>
      listTasksMergedSorted(
        board,
        listId,
        visibleStatuses,
        activeGroup,
        workflowOrder,
      ),
    [board, listId, visibleStatuses, activeGroup, workflowOrder],
  );

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const addCardRef = useRef<HTMLDivElement>(null);
  const createPendingRef = useRef(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  createPendingRef.current = createTask.isPending;

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

  return (
    <>
      <ListHeader
        boardId={board.id}
        list={list}
        dragAttributes={dragAttributes}
        dragListeners={dragListeners}
      />
      <div
        className={cn(
          "flex min-h-0 flex-col bg-muted/20 dark:bg-muted/10",
          "max-h-[min(70vh,calc(100dvh-11rem))] overflow-y-auto overscroll-y-contain p-2",
        )}
        data-board-id={board.id}
        data-list-id={listId}
        aria-label={`${list.name} — tasks`}
      >
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              groupLabel={groupLabelForId(board.taskGroups, task.groupId)}
              onOpen={() => setEditingTask(task)}
            />
          ))}
        </div>
        {canAddOpen ? (
          !adding ? (
            <button
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
          ) : (
            <div
              ref={addCardRef}
              className="mt-2 shrink-0 rounded-md border border-border bg-background/80 p-2"
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
          )
        ) : null}
      </div>

      <TaskEditor
        board={board}
        open={editingTask !== null}
        onClose={() => setEditingTask(null)}
        mode="edit"
        task={editingTask ?? undefined}
      />
    </>
  );
}

export interface BoardListStackedColumnOverlayProps {
  board: Board;
  listId: number;
}

/** Drag overlay clone for stacked list columns. */
export function BoardListStackedColumnOverlay({
  board,
  listId,
}: BoardListStackedColumnOverlayProps) {
  const workflowOrder = useStatusWorkflowOrder();
  const list = board.lists.find((l) => l.id === listId);
  if (!list) return null;
  const visibleStatuses = visibleStatusesForBoard(board, workflowOrder);
  return (
    <div className="pointer-events-none w-72 shrink-0 cursor-grabbing overflow-hidden rounded-lg border border-border bg-list-column opacity-90 shadow-xl ring-2 ring-primary/25">
      <ListStackedBody
        board={board}
        list={list}
        listId={listId}
        visibleStatuses={visibleStatuses}
        workflowOrder={workflowOrder}
      />
    </div>
  );
}

interface BoardListStackedColumnProps {
  board: Board;
  listId: number;
}

export function BoardListStackedColumn({
  board,
  listId,
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
  } = useSortable({ id: listId });

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
      className="relative flex w-72 shrink-0 flex-col self-start"
      data-list-column={list.id}
      data-board-no-pan
    >
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-lg border bg-list-column shadow-sm transition-[opacity,border-color]",
          isDragging
            ? "border-2 border-dashed border-primary/20 bg-muted/30 shadow-none"
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
          />
        )}
      </div>
    </div>
  );
}
