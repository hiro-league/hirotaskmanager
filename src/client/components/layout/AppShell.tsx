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
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Skip link: first tab stop; slides into view on focus-visible (Web Interface Guidelines #18). */}
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[10000] -translate-y-[200%] rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md outline-none transition-transform focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip to main content
      </a>
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
        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-board-canvas p-2 scroll-mt-12 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-board-canvas"
        >
          {children}
        </main>
      </div>
      <NotificationToasts />
    </div>
  );
}
