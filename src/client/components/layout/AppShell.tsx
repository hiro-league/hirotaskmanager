import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/store/preferences";
import { AppHeader } from "./AppHeader";

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  const sidebarCollapsed = usePreferencesStore((s) => s.sidebarCollapsed);

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
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
