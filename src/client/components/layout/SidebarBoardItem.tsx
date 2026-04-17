import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { boardDisplayName, type BoardIndexEntry } from "../../../shared/models";
import { boardPath } from "@/lib/boardPath";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/layout/SidebarContext";

export interface SidebarBoardItemProps {
  board: BoardIndexEntry;
  active: boolean;
}

export function SidebarBoardItem({ board, active }: SidebarBoardItemProps) {
  const navigate = useNavigate();
  const {
    editingId,
    editValue,
    setEditValue,
    openMenuId,
    setOpenMenuId,
    startRename,
    commitRename,
    cancelRename,
    requestDelete,
  } = useSidebar();

  const idStr = String(board.boardId);
  const editing = idStr === editingId;
  const menuOpen = idStr === openMenuId;

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
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                cancelRename();
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
            onClick={() => navigate(boardPath(idStr))}
            onDoubleClick={() => startRename(board.boardId, board.name)}
          >
            {boardDisplayName(board)}
          </button>
        )}
        {!editing && (
          <DropdownMenu.Root
            open={menuOpen}
            onOpenChange={(open) => setOpenMenuId(open ? idStr : null)}
          >
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
                  onSelect={() => {
                    setOpenMenuId(null);
                    startRename(board.boardId, board.name);
                  }}
                >
                  Edit
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-default rounded px-2 py-1.5 text-destructive outline-none hover:bg-destructive/10 focus:bg-destructive/10"
                  onSelect={() => requestDelete(board.boardId, board.name)}
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
