import {
  KeyboardSensor,
  PointerSensor,
} from "@dnd-kit/react";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { useSortable } from "@dnd-kit/react/sortable";

/** Isolates task-group editor rows from board list/task sortables in other providers. */
const TASK_GROUP_EDITOR_GROUP = "task-group-editor";

const TASK_GROUP_ROW_TYPE = "task-group-editor-row";

const taskGroupEditorPointerSensor = PointerSensor.configure({
  activationConstraints(event) {
    if (event.pointerType === "touch") {
      return [
        new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 }),
      ];
    }
    return [new PointerActivationConstraints.Distance({ value: 5 })];
  },
});

/**
 * Sortable row for the task group editor dialog — drag handle only (see
 * docs/drag_drop.md). Mirrors the React-first board column pattern.
 */
export function useTaskGroupEditorSortableRow(
  clientId: string,
  index: number,
  disabled: boolean,
) {
  return useSortable({
    id: clientId,
    index,
    group: TASK_GROUP_EDITOR_GROUP,
    type: TASK_GROUP_ROW_TYPE,
    accept: TASK_GROUP_ROW_TYPE,
    feedback: "clone",
    disabled,
    data: { clientId },
    sensors: [taskGroupEditorPointerSensor, KeyboardSensor],
  });
}
