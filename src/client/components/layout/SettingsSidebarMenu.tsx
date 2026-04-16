import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLogout } from "@/api/auth";
import { cn } from "@/lib/utils";

/** Settings row opens a menu (settings, log out) so the list can grow without crowding the header. */
export function SettingsSidebarMenu({
  collapsed,
  settingsActive,
}: {
  collapsed: boolean;
  settingsActive: boolean;
}) {
  const navigate = useNavigate();
  const logout = useLogout();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title="Settings and account"
          aria-label="Settings and account menu"
          aria-current={settingsActive ? "page" : undefined}
          className={cn(
            collapsed
              ? "flex w-full items-center justify-center rounded-md p-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50"
              : "mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            settingsActive && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
        >
          <Settings
            className={cn("shrink-0", collapsed ? "size-5" : "size-4")}
            aria-hidden
          />
          {!collapsed ? "Settings" : null}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="right"
          align="end"
          sideOffset={4}
          className="z-50 min-w-[10rem] rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
        >
          <DropdownMenu.Item
            className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            onSelect={() => navigate("/settings")}
          >
            <Settings className="size-4 shrink-0" aria-hidden />
            Settings
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-destructive outline-none hover:bg-destructive/10 focus:bg-destructive/10"
            disabled={logout.isPending}
            onSelect={() => logout.mutate()}
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
