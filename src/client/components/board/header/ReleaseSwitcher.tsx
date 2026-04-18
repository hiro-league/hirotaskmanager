import { startTransition, useMemo } from "react";
import { RELEASE_FILTER_UNTAGGED } from "../../../../shared/boardFilters";
import { sortReleasesForDisplay } from "../../../../shared/releaseSort";
import { EMPTY_SORTABLE_IDS } from "@/components/board/dnd/dndIds";
import type { Board } from "../../../../shared/models";
import {
  useBoardFiltersStore,
  useResolvedActiveReleaseIds,
} from "@/store/preferences";
import { BoardHeaderMultiSelect } from "./BoardHeaderMultiSelect";

interface ReleaseSwitcherProps {
  board: Board;
  headerHovered?: boolean;
  onOpenReleasesEditor?: () => void;
}

export function ReleaseSwitcher({
  board,
  headerHovered,
  onOpenReleasesEditor,
}: ReleaseSwitcherProps) {
  const setActive = useBoardFiltersStore((s) => s.setActiveReleaseIdsForBoard);
  const activeReleaseIds = useResolvedActiveReleaseIds(board.boardId, board.releases);
  const options = useMemo(
    () => [
      ...sortReleasesForDisplay(board.releases).map((r) => ({
        id: String(r.releaseId),
        label: r.name,
        color: r.color ?? undefined,
        markAsDefault:
          board.defaultReleaseId != null &&
          r.releaseId === board.defaultReleaseId,
      })),
      { id: RELEASE_FILTER_UNTAGGED, label: "Unassigned" },
    ],
    [board.defaultReleaseId, board.releases],
  );

  return (
    <BoardHeaderMultiSelect
      sectionLabel="Release"
      allLabel="All Releases"
      chooseAriaLabel="Choose releases"
      clearAllLabel="Clear all releases"
      removeItemAriaLabel={(label) => `Remove ${label}`}
      options={options}
      selectedIds={activeReleaseIds ?? EMPTY_SORTABLE_IDS}
      headerHovered={headerHovered}
      onChange={(nextSelectedIds) =>
        startTransition(() =>
          setActive(
            board.boardId,
            nextSelectedIds.length > 0 ? nextSelectedIds : undefined,
          ),
        )
      }
      onOpenEditor={onOpenReleasesEditor}
      editButtonAriaLabel="Edit releases"
    />
  );
}
