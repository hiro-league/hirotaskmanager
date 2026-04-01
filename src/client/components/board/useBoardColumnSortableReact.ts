import { useSortable } from "@dnd-kit/react/sortable";
import {
  BOARD_COLUMNS_GROUP,
  BOARD_COLUMN_DND_TYPE,
  boardColumnDragData,
} from "./dndReactModel";
import { sortableListId } from "./dndIds";

/**
 * Phase 1 React-first wrapper for sortable board columns.
 * This keeps the new list-column configuration in one place so the later
 * provider swap can reuse it in stacked and lanes layouts.
 */
export function useBoardColumnSortableReact(listId: number, index: number) {
  return useSortable({
    id: sortableListId(listId),
    index,
    group: BOARD_COLUMNS_GROUP,
    type: BOARD_COLUMN_DND_TYPE,
    accept: BOARD_COLUMN_DND_TYPE,
    feedback: "clone",
    data: boardColumnDragData(listId),
  });
}
