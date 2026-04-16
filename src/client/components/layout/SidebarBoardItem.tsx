import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreVertical } from "lucide-react";
import { boardDisplayName, type BoardIndexEntry } from "../../../shared/models";
import { cn } from "@/lib/utils";

export interface SidebarBoardItemProps {
  board: BoardIndexEntry;
  active: boolean;
  editing: boolean;
  editValue: string;
  menuOpen: boolean;
  onNavigate: () => void;
  onDoubleClickRename: () => void;
  /** Clears the overflow menu then starts rename (Edit menu item). */
  onRenameFromMenu: () => void;
  onEditValueChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onMenuOpenChange: (open: boolean) => void;
  onRequestDelete: () => void;
}

export function SidebarBoardItem({
  board,
  active,
  editing,
  editValue,
  menuOpen,
  onNavigate,
  onDoubleClickRename,
  onRenameFromMenu,
  onEditValueChange,
  onRenameCommit,
  onRenameCancel,
  onMenuOpenChange,
  onRequestDelete,
}: SidebarBoardItemProps) {
  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md transition-colors",
          active && "bg-sidebar-accent text-sidebar-accent-foreground",
        )}
      >
        {editing ? (
          <input
            autoFocus
            className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground"
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onBlur={() => void onRenameCommit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                onRenameCancel();
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={cn(
              "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm",
              !active && "hover:bg-sidebar-accent/50",
            )}
            onClick={() => onNavigate()}
            onDoubleClick={() => onDoubleClickRename()}
          >
            {boardDisplayName(board)}
          </button>
        )}
        {!editing && (
          <DropdownMenu.Root open={menuOpen} onOpenChange={onMenuOpenChange}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="rounded p-1.5 text-muted-foreground opacity-0 hover:bg-sidebar-accent/70 hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
                aria-label={`Actions for ${board.name}`}
              >
                <MoreVertical className="size-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="z-50 min-w-[9.5rem] rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
              >
                <DropdownMenu.Item
                  className="flex cursor-default rounded px-2 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                  onSelect={() => onRenameFromMenu()}
                >
                  Edit
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-default rounded px-2 py-1.5 text-destructive outline-none hover:bg-destructive/10 focus:bg-destructive/10"
                  onSelect={() => onRequestDelete()}
                >
                  Move to Trash
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
    </li>
  );
}
