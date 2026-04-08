import { RELEASE_FILTER_UNTAGGED } from "../../../shared/boardFilters";
import type { Board } from "../../../shared/models";
import {
  usePreferencesStore,
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
  const setActive = usePreferencesStore((s) => s.setActiveReleaseIdsForBoard);
  const activeReleaseIds = useResolvedActiveReleaseIds(board.id, board.releases);
  const options = [
    { id: RELEASE_FILTER_UNTAGGED, label: "Untagged" },
    ...board.releases.map((r) => ({
      id: String(r.id),
      label: r.name,
      color: r.color ?? undefined,
    })),
  ];

  return (
    <BoardHeaderMultiSelect
      sectionLabel="Release"
      allLabel="All Releases"
      chooseAriaLabel="Choose releases"
      clearAllLabel="Clear all releases"
      removeItemAriaLabel={(label) => `Remove ${label}`}
      options={options}
      selectedIds={activeReleaseIds ?? []}
      headerHovered={headerHovered}
      onChange={(nextSelectedIds) =>
        setActive(board.id, nextSelectedIds.length > 0 ? nextSelectedIds : undefined)
      }
      onOpenEditor={onOpenReleasesEditor}
      editButtonAriaLabel="Edit releases"
    />
  );
}
