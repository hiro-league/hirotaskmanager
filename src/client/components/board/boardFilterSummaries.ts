import { RELEASE_FILTER_UNTAGGED } from "../../../shared/boardFilters";
import {
  groupDisplayLabelForId,
  priorityDisplayLabel,
  priorityLabelForId,
  sortPrioritiesByValue,
  type Board,
} from "../../../shared/models";
import { formatMonthDayShortMaybeYear } from "@/lib/intlDateFormat";
import type { TaskDateFilterResolved } from "./boardStatusUtils";

export interface BoardFilterSummaryChip {
  summary: string;
  tooltip?: string;
  color?: string;
}

export interface BoardFilterSummaries {
  group: BoardFilterSummaryChip | null;
  priority: BoardFilterSummaryChip | null;
  release: BoardFilterSummaryChip | null;
  dateSummary: string | null;
  defaultRelease: Board["releases"][number] | null;
}

function formatYmdForBadge(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m - 1, d);
  return formatMonthDayShortMaybeYear(dt);
}

function formatTaskDateFilterBadge(
  startDate: string,
  endDate: string,
  mode: TaskDateFilterResolved["mode"],
): string {
  const range =
    startDate === endDate
      ? formatYmdForBadge(startDate)
      : `${formatYmdForBadge(startDate)}–${formatYmdForBadge(endDate)}`;
  const modeLabel =
    mode === "opened" ? "Opened" : mode === "closed" ? "Closed" : "Any";
  return `${range} · ${modeLabel}`;
}

function buildSummaryChip(
  labels: string[] | null,
  pluralLabel: string,
  color?: string,
): BoardFilterSummaryChip | null {
  if (labels == null || labels.length === 0) return null;
  return {
    summary: labels.length === 1 ? labels[0]! : `(${labels.length} ${pluralLabel})`,
    tooltip: labels.length > 1 ? labels.join(", ") : undefined,
    color,
  };
}

export function buildBoardFilterSummaries(
  board: Board,
  activeTaskGroupIds: string[] | null,
  activeTaskPriorityIds: string[] | null,
  activeReleaseIds: string[] | null,
  dateFilterResolved: TaskDateFilterResolved | null,
): BoardFilterSummaries {
  const activeGroupLabels =
    activeTaskGroupIds?.map((groupId) =>
      groupDisplayLabelForId(board.taskGroups, Number(groupId)),
    ) ?? null;
  const activePriorityLabels =
    activeTaskPriorityIds?.flatMap((priorityId) => {
      const label = priorityLabelForId(board.taskPriorities, Number(priorityId));
      return label ? [priorityDisplayLabel(label)] : [];
    }) ?? null;
  const activePriorityColor =
    activeTaskPriorityIds && activeTaskPriorityIds.length === 1
      ? sortPrioritiesByValue(board.taskPriorities).find(
          (priority) => String(priority.priorityId) === activeTaskPriorityIds[0],
        )?.color
      : undefined;
  const activeReleaseLabels =
    activeReleaseIds?.flatMap((releaseId) => {
      if (releaseId === RELEASE_FILTER_UNTAGGED) return ["Unassigned"];
      const release = board.releases.find((entry) => String(entry.releaseId) === releaseId);
      const name = release?.name ?? "";
      return name ? [name] : [];
    }) ?? null;
  const activeReleaseColor =
    activeReleaseIds &&
    activeReleaseIds.length === 1 &&
    activeReleaseIds[0] !== RELEASE_FILTER_UNTAGGED
      ? board.releases.find((release) => String(release.releaseId) === activeReleaseIds[0])
          ?.color ?? undefined
      : undefined;

  return {
    group: buildSummaryChip(activeGroupLabels, "Groups"),
    priority: buildSummaryChip(
      activePriorityLabels,
      "Priorities",
      activePriorityColor,
    ),
    release: buildSummaryChip(
      activeReleaseLabels,
      "Releases",
      activeReleaseColor,
    ),
    dateSummary: dateFilterResolved
      ? formatTaskDateFilterBadge(
          dateFilterResolved.startDate,
          dateFilterResolved.endDate,
          dateFilterResolved.mode,
        )
      : null,
    defaultRelease:
      board.defaultReleaseId != null
        ? board.releases.find((release) => release.releaseId === board.defaultReleaseId) ??
          null
        : null,
  };
}
