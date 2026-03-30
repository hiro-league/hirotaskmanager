import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  ALL_TASK_GROUPS,
  groupLabelForId,
  type Board,
  type List,
  type Task,
} from "../../../shared/models";
import { useCreateTask } from "@/api/mutations";
import { TaskCard } from "@/components/task/TaskCard";
import { TaskEditor } from "@/components/task/TaskEditor";
import { useResolvedActiveTaskGroup } from "@/store/preferences";

interface ListStatusBandProps {
  board: Board;
  list: List;
  status: string;
}

export function ListStatusBand({ board, list, status }: ListStatusBandProps) {
  const createTask = useCreateTask();
  const activeGroup = useResolvedActiveTaskGroup(board.id, board.taskGroups);

  const tasks = useMemo(() => {
    let listTasks = board.tasks.filter(
      (t) => t.listId === list.id && t.status === status,
    );
    if (activeGroup !== ALL_TASK_GROUPS) {
      listTasks = listTasks.filter((t) => t.group === activeGroup);
    }
    return listTasks.sort((a, b) => a.order - b.order);
  }, [board.tasks, list.id, status, activeGroup]);

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

  const submitCard = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const defaultGroup =
      activeGroup !== ALL_TASK_GROUPS
        ? activeGroup
        : board.taskGroups[0]?.id ?? "";
    createTask.mutate(
      {
        boardId: board.id,
        listId: list.id,
        status,
        title: trimmed,
        body: "",
        group: defaultGroup,
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

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              groupLabel={groupLabelForId(board.taskGroups, task.group)}
              onOpen={() => setEditingTask(task)}
            />
          ))}
        </div>
        {!adding && status === "open" ? (
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
        ) : null}
        {adding && status === "open" ? (
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
                  submitCard();
                }
                if (e.key === "Escape") cancelAdd();
              }}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                disabled={createTask.isPending || !title.trim()}
                onClick={() => submitCard()}
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
