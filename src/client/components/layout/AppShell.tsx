import type { ReactNode } from "react";
import { useBoardChangeStream } from "@/api/useBoardChangeStream";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/store/preferences";
import { AppHeader } from "./AppHeader";
import { NotificationToasts } from "./NotificationToasts";

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  const sidebarCollapsed = usePreferencesStore((s) => s.sidebarCollapsed);
  // Single SSE connection for non-board pages (board-index + notifications).
  // On board pages, BoardView opens its own board-scoped connection that
  // supersedes this one — the effect re-runs with a boardId when navigating.
  useBoardChangeStream(null, null);

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <AppHeader />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <aside
          className={cn(
            "flex min-h-0 shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out",
            sidebarCollapsed ? "w-14" : "w-64",
          )}
        >
          {sidebar}
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-board-canvas p-2">
          {children}
        </main>
      </div>
      <NotificationToasts />
    </div>
  );
}
