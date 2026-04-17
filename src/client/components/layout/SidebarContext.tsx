import { createContext, use, type ReactNode } from "react";
import { useBoards } from "@/api/queries";
import type { BoardIndexEntry } from "../../../shared/models";
import { useSidebarBoardMutations } from "@/components/layout/useSidebarBoardMutations";

export type SidebarContextValue = ReturnType<typeof useSidebarBoardMutations> & {
  boards: BoardIndexEntry[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

/** Owns sidebar inline-edit drafts + board list mutations so `Sidebar`/`SidebarBoardItem` do not thread refs and draft state as props (composition review #9). */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const { data: boards = [], isLoading, isError, error } = useBoards();
  const mutations = useSidebarBoardMutations(boards);
  const value: SidebarContextValue = {
    boards,
    isLoading,
    isError,
    error,
    ...mutations,
  };
  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  // React 19: prefer `use()` over `useContext()` (vercel-composition-patterns round 2).
  const ctx = use(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return ctx;
}
