import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePreferencesStore } from "@/store/preferences";
import { OPEN_SHORTCUT_HELP_EVENT } from "@/lib/shortcutHelpEvents";
import type { Board } from "../../shared/models";

/** Chrome dialogs + shortcut help open state lived in BoardView and threaded through BoardHeader; provider removes prop drilling (composition review #2). */
export interface BoardDialogsContextValue {
  boardEditOpen: boolean;
  setBoardEditOpen: (open: boolean) => void;
  groupsEditorOpen: boolean;
  setGroupsEditorOpen: (open: boolean) => void;
  prioritiesEditorOpen: boolean;
  setPrioritiesEditorOpen: (open: boolean) => void;
  releasesEditorOpen: boolean;
  setReleasesEditorOpen: (open: boolean) => void;
  shortcutHelpOpen: boolean;
  helpOpenReason: "none" | "auto" | "manual";
  openHelp: () => void;
  openBoardEdit: () => void;
  openGroupsEditor: () => void;
  openPrioritiesEditor: () => void;
  openReleasesEditor: () => void;
  handleShortcutHelpClose: (result?: { dontShowAgain: boolean }) => void;
}

const BoardDialogsContext = createContext<BoardDialogsContextValue | null>(
  null,
);

export function useBoardDialogs(): BoardDialogsContextValue {
  const ctx = use(BoardDialogsContext);
  if (!ctx) {
    throw new Error("useBoardDialogs must be used within BoardDialogsProvider");
  }
  return ctx;
}

export function BoardDialogsProvider({
  board,
  children,
}: {
  board: Board;
  children: ReactNode;
}) {
  const boardShortcutHelpDismissed = usePreferencesStore(
    (s) => s.boardShortcutHelpDismissed,
  );
  const setBoardShortcutHelpDismissed = usePreferencesStore(
    (s) => s.setBoardShortcutHelpDismissed,
  );

  const [boardEditOpen, setBoardEditOpen] = useState(false);
  const [groupsEditorOpen, setGroupsEditorOpen] = useState(false);
  const [prioritiesEditorOpen, setPrioritiesEditorOpen] = useState(false);
  const [releasesEditorOpen, setReleasesEditorOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [helpOpenReason, setHelpOpenReason] = useState<
    "none" | "auto" | "manual"
  >("none");

  const openHelp = useCallback(() => {
    setHelpOpenReason("manual");
    setShortcutHelpOpen(true);
  }, []);

  useEffect(() => {
    const onOpenFromHeader = () => {
      setHelpOpenReason("manual");
      setShortcutHelpOpen(true);
    };
    window.addEventListener(OPEN_SHORTCUT_HELP_EVENT, onOpenFromHeader);
    return () =>
      window.removeEventListener(OPEN_SHORTCUT_HELP_EVENT, onOpenFromHeader);
  }, []);

  useEffect(() => {
    if (boardShortcutHelpDismissed) return;
    setHelpOpenReason("auto");
    setShortcutHelpOpen(true);
  }, [board.boardId, boardShortcutHelpDismissed]);

  const handleShortcutHelpClose = useCallback(
    (result?: { dontShowAgain: boolean }) => {
      setShortcutHelpOpen(false);
      setHelpOpenReason("none");
      if (result?.dontShowAgain) setBoardShortcutHelpDismissed(true);
    },
    [setBoardShortcutHelpDismissed],
  );

  const openBoardEdit = useCallback(() => setBoardEditOpen(true), []);
  const openGroupsEditor = useCallback(() => setGroupsEditorOpen(true), []);
  const openPrioritiesEditor = useCallback(
    () => setPrioritiesEditorOpen(true),
    [],
  );
  const openReleasesEditor = useCallback(() => setReleasesEditorOpen(true), []);

  const value = useMemo(
    (): BoardDialogsContextValue => ({
      boardEditOpen,
      setBoardEditOpen,
      groupsEditorOpen,
      setGroupsEditorOpen,
      prioritiesEditorOpen,
      setPrioritiesEditorOpen,
      releasesEditorOpen,
      setReleasesEditorOpen,
      shortcutHelpOpen,
      helpOpenReason,
      openHelp,
      openBoardEdit,
      openGroupsEditor,
      openPrioritiesEditor,
      openReleasesEditor,
      handleShortcutHelpClose,
    }),
    [
      boardEditOpen,
      groupsEditorOpen,
      prioritiesEditorOpen,
      releasesEditorOpen,
      shortcutHelpOpen,
      helpOpenReason,
      openHelp,
      openBoardEdit,
      openGroupsEditor,
      openPrioritiesEditor,
      openReleasesEditor,
      handleShortcutHelpClose,
    ],
  );

  return (
    <BoardDialogsContext.Provider value={value}>
      {children}
    </BoardDialogsContext.Provider>
  );
}
