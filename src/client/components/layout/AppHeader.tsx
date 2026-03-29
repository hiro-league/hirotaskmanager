import { ChevronsLeft, ChevronsRight, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/store/preferences";
import { resolveDark, useSystemDark } from "./ThemeRoot";

export function AppHeader() {
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
    <header className="flex h-12 w-full shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/70 text-foreground shadow-sm",
            "transition-[color,background-color,box-shadow] hover:bg-muted hover:shadow",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
        <span className="truncate text-sm font-semibold tracking-tight text-foreground">
          Hiro Tasks
        </span>
      </div>

      <div className="flex items-center">
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
