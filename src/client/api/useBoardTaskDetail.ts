import { useQuery } from "@tanstack/react-query";
import { boardTaskDetailKey, fetchTaskById } from "./queries";

/**
 * Full task row for `TaskEditor` when the board payload may omit body text.
 * Lives in a separate module from {@link fetchTaskById} so tests can `vi.spyOn`
 * the fetch without same-file call semantics bypassing the mock.
 */
export function useBoardTaskDetail(
  boardId: number,
  taskId: number | null | undefined,
  options: { enabled: boolean },
) {
  return useQuery({
    queryKey: boardTaskDetailKey(boardId, taskId ?? 0),
    queryFn: () => {
      if (taskId == null) {
        throw new Error("useBoardTaskDetail: taskId required when query runs");
      }
      return fetchTaskById(taskId);
    },
    enabled: options.enabled && taskId != null,
  });
}
