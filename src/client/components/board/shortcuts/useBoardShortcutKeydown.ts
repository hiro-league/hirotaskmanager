import { useEffect, useRef } from "react";
import type { Board } from "../../../../shared/models";
import { boardShortcutRegistry } from "./boardShortcutRegistry";
import type { BoardShortcutActions } from "./boardShortcutTypes";
import { isEditableKeyboardTarget } from "./isEditableKeyboardTarget";
import { useShortcutScope } from "./ShortcutScopeContext";

interface UseBoardShortcutKeydownOptions {
  board: Board | null;
  actions: BoardShortcutActions;
}

/**
 * Registers the board shortcut dispatcher with {@link ShortcutScopeProvider}.
 * The global listener only invokes it when the scope stack is empty (board is active).
 */
export function useBoardShortcutKeydown({
  board,
  actions,
}: UseBoardShortcutKeydownOptions): void {
  const { registerBoardKeyHandler } = useShortcutScope();
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    if (!board) {
      return registerBoardKeyHandler(() => {});
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!board) return;
      if (isEditableKeyboardTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      for (const def of boardShortcutRegistry) {
        if (!def.matchKey(e.key)) continue;
        if (def.enabled && !def.enabled(board)) continue;
        if (def.preventDefault) e.preventDefault();
        def.run(board, actionsRef.current);
        return;
      }
    };

    return registerBoardKeyHandler(onKeyDown);
  }, [board, registerBoardKeyHandler]);
}
