import { ChevronsLeft, ChevronsRight, Command, Moon, Search, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useBoardSearchOptional } from "@/context/BoardSearchContext";
import { cn } from "@/lib/utils";
import { dispatchOpenShortcutHelp } from "@/lib/shortcutHelpEvents";
import { usePreferencesStore } from "@/store/preferences";
import { NotificationBell } from "./NotificationBell";
import { resolveDark, useSystemDark } from "./ThemeRoot";

export function AppHeader() {
  const { pathname } = useLocation();
  const shortcutHelpAvailable = pathname.startsWith("/board/");
  const boardSearch = useBoardSearchOptional();
  const showBoardSearchButton = shortcutHelpAvailable && boardSearch;
  const sidebarCollapsed = usePreferencesStore((s) => s.sidebarCollapsed);
  const toggleSidebar = usePreferencesStore((s) => s.toggleSidebarCollapsed);
  const themePreference = usePreferencesStore((s) => s.themePreference);
  const setThemePreference = usePreferencesStore((s) => s.setThemePreference);
  const systemDark = useSystemDark();
  const resolvedDark = resolveDark(themePreference, systemDark);

  const flipTheme = () => {
    setThemePreference(resolvedDark ? "light" : "dark");
  };

  return (
    <header className="flex h-12 w-full shrink-0 items-center gap-2 border-b border-header-border bg-header px-3 sm:gap-3 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/70 text-foreground shadow-sm",
            "transition-[color,background-color,box-shadow] hover:bg-muted hover:shadow",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-header",
            "active:translate-y-px active:shadow-sm",
          )}
        >
          {sidebarCollapsed ? (
            <ChevronsRight className="size-5 shrink-0" aria-hidden />
          ) : (
            <ChevronsLeft className="size-5 shrink-0" aria-hidden />
          )}
        </button>
        <img
          src="/hirologo.png"
          alt=""
          className="size-8 shrink-0 object-contain"
          width={32}
          height={32}
          decoding="async"
        />
        <span className="app-title-gradient inline-block truncate text-lg font-semibold tracking-tight">
          Hiro Task Manager
        </span>
      </div>

      {/* Search: shrinks with the middle flex slot; below container width threshold, collapses to icon-only. */}
      {showBoardSearchButton ? (
        <div className="@container flex min-w-0 max-w-md flex-1 shrink-[2] items-center justify-center px-1">
          <button
            type="button"
            title="Search tasks (K or F3)"
            aria-label="Search tasks on this board"
            onClick={() => boardSearch.openSearch()}
            className={cn(
              "inline-flex h-9 min-h-9 w-full min-w-9 max-w-md items-center gap-2 rounded-md border border-border bg-muted/70 px-3 py-0 text-left text-sm text-muted-foreground shadow-sm",
              "transition-[color,background-color,box-shadow,width] hover:bg-muted hover:text-foreground hover:shadow",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-header",
              "active:translate-y-px active:shadow-sm",
              // Icon-only when the search slot is too narrow (container query on parent).
              "@max-[280px]:w-9 @max-[280px]:max-w-9 @max-[280px]:flex-none @max-[280px]:justify-center @max-[280px]:gap-0 @max-[280px]:px-0",
            )}
          >
            {/* Icon uses currentColor so it tracks the button’s muted → foreground hover. */}
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate select-none @max-[280px]:hidden">
              Search tasks…
            </span>
          </button>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <NotificationBell />
        <button
          type="button"
          disabled={!shortcutHelpAvailable}
          title={
            shortcutHelpAvailable
              ? "Keyboard shortcuts (H)"
              : "Open a board to view keyboard shortcuts"
          }
          aria-label={
            shortcutHelpAvailable
              ? "Keyboard shortcuts"
              : "Keyboard shortcuts — open a board first"
          }
          onClick={() => dispatchOpenShortcutHelp()}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/70 text-foreground shadow-sm",
            "transition-[color,background-color,box-shadow] hover:bg-muted hover:shadow",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-header",
            "active:translate-y-px active:shadow-sm",
            !shortcutHelpAvailable && "cursor-not-allowed opacity-45 hover:bg-muted/70 hover:shadow-none",
          )}
        >
          <Command className="size-5 shrink-0" aria-hidden />
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={resolvedDark}
          aria-label={resolvedDark ? "Switch to light theme" : "Switch to dark theme"}
          onClick={flipTheme}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-input bg-muted transition-colors",
            resolvedDark && "bg-primary/25 border-primary/30",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-flex size-6 translate-x-0.5 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border transition-transform",
              resolvedDark && "translate-x-[1.375rem]",
            )}
          >
            {resolvedDark ? (
              <Moon className="size-3.5 text-foreground" aria-hidden />
            ) : (
              <Sun className="size-3.5 text-foreground" aria-hidden />
            )}
          </span>
        </button>
      </div>
    </header>
  );
}
