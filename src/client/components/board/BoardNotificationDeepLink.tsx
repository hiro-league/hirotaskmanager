import { useLayoutEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Board } from "../../../shared/models";
import { useBoardKeyboardNav } from "./shortcuts/BoardKeyboardNavContext";
import { useBoardTaskKeyboardBridge } from "./shortcuts/BoardTaskKeyboardBridge";

/**
 * Consumes `#taskId=` / `#listId=` from the board URL hash (notification deep links).
 * Uses `useLayoutEffect` so selection runs before paint and before the passive
 * "default first list/task" highlight effect, and re-runs when `nav` updates (columnMap
 * ready after moves/filters). Waits until the task/list exists on `board` so we do not
 * treat a not-yet-loaded columnMap as "filtered out".
 */
export function BoardNotificationDeepLink({ board }: { board: Board }) {
  const location = useLocation();
  const navigate = useNavigate();
  const nav = useBoardKeyboardNav();
  const bridge = useBoardTaskKeyboardBridge();

  const { taskRaw, listRaw } = useMemo(() => {
    const qs = location.hash.startsWith("#") ? location.hash.slice(1) : "";
    const p = new URLSearchParams(qs);
    return { taskRaw: p.get("taskId"), listRaw: p.get("listId") };
  }, [location.hash]);

  useLayoutEffect(() => {
    if (taskRaw == null && listRaw == null) return;

    const taskId = taskRaw != null ? Number(taskRaw) : NaN;
    const listId = listRaw != null ? Number(listRaw) : NaN;

    if (Number.isFinite(taskId)) {
      if (!board.tasks.some((t) => t.id === taskId)) {
        return;
      }
      const r = nav.applyNotificationTarget({ taskId });
      if (r.kind === "task_filtered_out") {
        bridge.requestOpenTaskEditor(r.taskId);
      }
      navigate({ hash: "" }, { replace: true });
      return;
    }

    if (Number.isFinite(listId)) {
      if (!board.lists.some((l) => l.id === listId)) {
        return;
      }
      nav.applyNotificationTarget({ listId });
      navigate({ hash: "" }, { replace: true });
    }
  }, [
    board.id,
    board.lists,
    board.tasks,
    bridge,
    listRaw,
    navigate,
    nav,
    taskRaw,
  ]);

  return null;
}
