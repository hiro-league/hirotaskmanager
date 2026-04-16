import {
  buildBoardDescribeResponse,
  type BoardDescribeResponse,
  type ParsedBoardDescribeEntities,
} from "../../../shared/boardDescribe";
import { loadBoardWithoutTasks } from "./board";
import { listStatuses } from "../system/statuses";

/** Agent-oriented board probe: structure and policy without tasks (see `docs/todo.md`). */
export function loadBoardDescribe(
  boardId: number,
  parsed: ParsedBoardDescribeEntities & { ok: true },
): BoardDescribeResponse | null {
  const shell = loadBoardWithoutTasks(boardId);
  if (!shell) return null;
  return buildBoardDescribeResponse(shell, listStatuses(), parsed);
}
