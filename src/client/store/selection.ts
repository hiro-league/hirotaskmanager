import { useCallback, useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";

interface SelectionState {
  selectedBoardId: string | null;
  setSelectedBoardId: (id: string | null) => void;
}

const selectionStore = createStore<SelectionState>((set) => ({
  selectedBoardId: null,
  setSelectedBoardId: (id) =>
    set((state) => {
      // #region agent log
      fetch("http://127.0.0.1:7317/ingest/4bca21ba-5670-416c-9bf6-209fed4aa1cb", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "bfa499",
        },
        body: JSON.stringify({
          sessionId: "bfa499",
          runId: "post-fix",
          hypothesisId: "H1",
          location: "selection.ts:setSelectedBoardId",
          message: "selectedBoardId update",
          data: { from: state.selectedBoardId, to: id },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return { selectedBoardId: id };
    }),
}));

/** Same snapshot for client + server avoids React 19 / Strict Mode reading stale `getInitialState()` (always null). */
function useSelectionStoreImpl<T>(selector: (state: SelectionState) => T): T {
  const getSnapshot = useCallback(
    () => selector(selectionStore.getState()),
    [selector],
  );
  return useSyncExternalStore(
    selectionStore.subscribe,
    getSnapshot,
    getSnapshot,
  );
}

export const useSelectionStore = Object.assign(useSelectionStoreImpl, {
  getState: selectionStore.getState,
  setState: selectionStore.setState,
  subscribe: selectionStore.subscribe,
  getInitialState: selectionStore.getInitialState,
});
