import type { Board } from "../../../shared/models";
import { ALL_TASK_GROUPS } from "../../../shared/models";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/store/preferences";

interface TaskGroupSwitcherProps {
  board: Board;
}

export function TaskGroupSwitcher({ board }: TaskGroupSwitcherProps) {
  const setActive = usePreferencesStore((s) => s.setActiveTaskGroupForBoard);
  const raw = usePreferencesStore(
    (s) => s.activeTaskGroupByBoardId[String(board.id)],
  );

  const resolved =
    raw === ALL_TASK_GROUPS
      ? ALL_TASK_GROUPS
      : raw && board.taskGroups.some((g) => String(g.id) === raw)
        ? raw
        : ALL_TASK_GROUPS;

  const pick = (value: string) => {
    setActive(board.id, value);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Task group filter"
    >
      <span className="text-xs font-medium text-muted-foreground">Groups</span>
      <button
        type="button"
        className={cn(
          "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
          resolved === ALL_TASK_GROUPS
            ? "border-primary/40 bg-primary/15 text-foreground"
            : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
        )}
        aria-pressed={resolved === ALL_TASK_GROUPS}
        onClick={() => pick(ALL_TASK_GROUPS)}
      >
        All groups
      </button>
      {board.taskGroups.map((g) => {
        const active = resolved === String(g.id);
        return (
          <button
            key={g.id}
            type="button"
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary/40 bg-primary/15 text-foreground"
                : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
            )}
            aria-pressed={active}
            onClick={() => pick(String(g.id))}
          >
            {g.label}
          </button>
        );
      })}
    </div>
  );
}
