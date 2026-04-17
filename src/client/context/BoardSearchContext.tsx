import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface BoardSearchContextValue {
  open: boolean;
  openSearch: () => void;
  closeSearch: () => void;
}

const BoardSearchContext = createContext<BoardSearchContextValue | null>(null);

export function BoardSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openSearch = useCallback(() => setOpen(true), []);
  const closeSearch = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, openSearch, closeSearch }),
    [open, openSearch, closeSearch],
  );

  return (
    <BoardSearchContext.Provider value={value}>
      {children}
    </BoardSearchContext.Provider>
  );
}

export function useBoardSearch(): BoardSearchContextValue {
  const ctx = use(BoardSearchContext);
  if (!ctx) {
    throw new Error("useBoardSearch must be used within BoardSearchProvider");
  }
  return ctx;
}

export function useBoardSearchOptional(): BoardSearchContextValue | null {
  return use(BoardSearchContext);
}
