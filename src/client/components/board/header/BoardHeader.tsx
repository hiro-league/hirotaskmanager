import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bot, ChevronDown, ChevronUp, MoreVertical } from "lucide-react";
import {
  createContext,
  use,
  useMemo,
  type ReactNode,
  type RefObject,
} from "react";
import type { Board } from "../../../../shared/models";
import { useBoardDialogs } from "@/context/BoardDialogsContext";
import { useBoardEditing } from "@/context/BoardEditingContext";
import { EmojiPickerMenuButton } from "@/components/emoji/EmojiPickerMenuButton";
import { cn } from "@/lib/utils";
import { BoardCelebrationSoundToggle } from "./BoardCelebrationSoundToggle";
import { BoardColorMenu } from "./BoardColorMenu";
import type { BoardFilterSummaries } from "../boardFilterSummaries";
import { BoardLayoutToggle } from "../columns/BoardLayoutToggle";
import { BoardPriorityToggles } from "./BoardPriorityToggles";
import { BoardStatsChipsRow } from "./BoardStatsChips";
import type { BoardStatsDisplayValue } from "../BoardStatsContext";
import { BoardStatsVisibilityToggle } from "./BoardStatsVisibilityToggle";
import { BoardStatusToggles } from "./BoardStatusToggles";
import { BoardTaskCardSizeToggle } from "./BoardTaskCardSizeToggle";
import { BoardTaskDateFilter } from "./BoardTaskDateFilter";
import { ReleaseSwitcher } from "./ReleaseSwitcher";
import { TaskGroupSwitcher } from "./TaskGroupSwitcher";
import type { UseBoardHeaderScrollMetricsResult } from "../useBoardHeaderScrollMetrics";

/** Scroll surface + collapse control; passed with {@link BoardHeaderSurfaceProps}, {@link BoardHeaderEmojiProps}, etc. (composition round 4: slice props + small contexts). */
export interface BoardHeaderShellProps {
  boardHeaderRef: RefObject<HTMLDivElement | null>;
  headerScroll: UseBoardHeaderScrollMetricsResult;
  filterCollapsed: boolean;
  toggleFilterStrip: () => void;
}

export interface BoardHeaderSurfaceProps {
  boardSurfaceId: string | null;
}

export interface BoardHeaderEmojiProps {
  boardEmojiFieldError: string | null;
  onBoardEmojiValidationError: (value: string | null) => void;
  patchBoardPending: boolean;
  pickBoardEmoji: (next: string | null) => void | Promise<void>;
}

export interface BoardHeaderFiltersProps {
  filterSummaries: BoardFilterSummaries;
}

export interface BoardHeaderStatsRowProps {
  boardStatsDisplay: BoardStatsDisplayValue;
  boardStats: { total: number; open: number; closed: number };
}

/** Props passed once into BoardHeader.Root; subcomponents read via focused contexts (composition review #3 + round 4 slices). */
export interface BoardHeaderProps {
  board: Board;
  shell: BoardHeaderShellProps;
  surface: BoardHeaderSurfaceProps;
  emoji: BoardHeaderEmojiProps;
  filters: BoardHeaderFiltersProps;
  stats: BoardHeaderStatsRowProps;
}

const BoardHeaderBoardContext = createContext<Board | null>(null);
const BoardHeaderShellContext = createContext<BoardHeaderShellProps | null>(null);
const BoardHeaderSurfaceContext =
  createContext<BoardHeaderSurfaceProps | null>(null);
const BoardHeaderEmojiContext = createContext<BoardHeaderEmojiProps | null>(
  null,
);
const BoardHeaderFiltersContext = createContext<BoardHeaderFiltersProps | null>(
  null,
);
const BoardHeaderStatsRowContext = createContext<BoardHeaderStatsRowProps | null>(
  null,
);

function useBoardHeaderBoard(): Board {
  const ctx = use(BoardHeaderBoardContext);
  if (!ctx) {
    throw new Error("BoardHeader subcomponents must be used within BoardHeader.Root");
  }
  return ctx;
}

function useBoardHeaderShell(): BoardHeaderShellProps {
  const ctx = use(BoardHeaderShellContext);
  if (!ctx) {
    throw new Error("BoardHeader subcomponents must be used within BoardHeader.Root");
  }
  return ctx;
}

function useBoardHeaderSurface(): BoardHeaderSurfaceProps {
  const ctx = use(BoardHeaderSurfaceContext);
  if (!ctx) {
    throw new Error("BoardHeader subcomponents must be used within BoardHeader.Root");
  }
  return ctx;
}

function useBoardHeaderEmoji(): BoardHeaderEmojiProps {
  const ctx = use(BoardHeaderEmojiContext);
  if (!ctx) {
    throw new Error("BoardHeader subcomponents must be used within BoardHeader.Root");
  }
  return ctx;
}

function useBoardHeaderFilters(): BoardHeaderFiltersProps {
  const ctx = use(BoardHeaderFiltersContext);
  if (!ctx) {
    throw new Error("BoardHeader subcomponents must be used within BoardHeader.Root");
  }
  return ctx;
}

function useBoardHeaderStatsRow(): BoardHeaderStatsRowProps {
  const ctx = use(BoardHeaderStatsRowContext);
  if (!ctx) {
    throw new Error("BoardHeader subcomponents must be used within BoardHeader.Root");
  }
  return ctx;
}

function BoardHeaderRoot({
  children,
  board,
  shell,
  surface,
  emoji,
  filters,
  stats,
}: BoardHeaderProps & { children: ReactNode }) {
  const boardValue = useMemo(() => board, [board]);
  const shellValue = useMemo(() => shell, [shell]);
  const surfaceValue = useMemo(() => surface, [surface]);
  const emojiValue = useMemo(() => emoji, [emoji]);
  const filtersValue = useMemo(() => filters, [filters]);
  const statsValue = useMemo(() => stats, [stats]);

  return (
    <BoardHeaderBoardContext.Provider value={boardValue}>
      <BoardHeaderShellContext.Provider value={shellValue}>
        <BoardHeaderSurfaceContext.Provider value={surfaceValue}>
          <BoardHeaderEmojiContext.Provider value={emojiValue}>
            <BoardHeaderFiltersContext.Provider value={filtersValue}>
              <BoardHeaderStatsRowContext.Provider value={statsValue}>
                <div
                  ref={shell.boardHeaderRef}
                  className="relative shrink-0 border-b"
                  onMouseEnter={shell.headerScroll.onHeaderMouseEnter}
                  onMouseLeave={shell.headerScroll.onHeaderMouseLeave}
                  style={{
                    background: "var(--board-header-bg)",
                    borderBottomColor: "var(--board-header-border)",
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 rounded-t-lg"
                    aria-hidden
                    style={{
                      background:
                        "linear-gradient(90deg, rgb(0 0 0 / var(--board-header-left-shadow-opacity, 0)) 0%, transparent 2.25rem, transparent calc(100% - 2.25rem), rgb(0 0 0 / var(--board-header-right-fade-opacity, 0)) 100%)",
                    }}
                  />
                  <div
                    className={cn(
                      "relative z-10 flex flex-col px-6 pt-2",
                      shell.filterCollapsed ? "gap-1 pb-2" : "gap-2 pb-3",
                    )}
                  >
                    {children}
                  </div>
                </div>
              </BoardHeaderStatsRowContext.Provider>
            </BoardHeaderFiltersContext.Provider>
          </BoardHeaderEmojiContext.Provider>
        </BoardHeaderSurfaceContext.Provider>
      </BoardHeaderShellContext.Provider>
    </BoardHeaderBoardContext.Provider>
  );
}

function BoardHeaderTitleRow({ children }: { children: ReactNode }) {
  return (
    <div className="@container flex min-w-0 items-center gap-3 overflow-hidden">
      {children}
    </div>
  );
}

function BoardHeaderTitle() {
  const board = useBoardHeaderBoard();
  const { filterCollapsed } = useBoardHeaderShell();
  const {
    boardEmojiFieldError,
    onBoardEmojiValidationError,
    patchBoardPending,
    pickBoardEmoji,
  } = useBoardHeaderEmoji();
  const {
    editingBoardName,
    setEditingBoardName,
    boardNameDraft,
    setBoardNameDraft,
    boardNameInputRef,
    boardNameBlurModeRef,
    commitBoardRename,
    cancelBoardRename,
  } = useBoardEditing();
  const { openBoardEdit, openGroupsEditor, openPrioritiesEditor } =
    useBoardDialogs();

  return (
    <div className="relative flex min-w-0 flex-1 items-center gap-2">
      {boardEmojiFieldError ? (
        <p className="absolute left-0 top-full z-20 mt-0.5 max-w-[min(100%,12rem)] text-[10px] text-destructive">
          {boardEmojiFieldError}
        </p>
      ) : null}
      <EmojiPickerMenuButton
        emoji={board.emoji}
        disabled={patchBoardPending}
        compact
        placeholderIcon={
          <span
            className="text-[0.9375rem] font-medium leading-none text-muted-foreground"
            aria-hidden
          >
            ?
          </span>
        }
        onValidationError={onBoardEmojiValidationError}
        chooseAriaLabel="Choose board emoji"
        selectedAriaLabel={(emoji) => `Change board emoji (${emoji})`}
        onPick={pickBoardEmoji}
      />
      {editingBoardName ? (
        <input
          ref={boardNameInputRef}
          type="text"
          className={cn(
            "w-full min-w-[12rem] max-w-[28rem] rounded-md border border-input bg-background px-2.5 py-1 text-left text-foreground shadow-sm",
            filterCollapsed
              ? "text-base font-semibold leading-tight"
              : "text-2xl font-semibold leading-tight",
          )}
          value={boardNameDraft}
          disabled={patchBoardPending}
          onChange={(event) => setBoardNameDraft(event.target.value)}
          onBlur={() => {
            if (boardNameBlurModeRef.current === "cancel") {
              boardNameBlurModeRef.current = "commit";
              return;
            }
            void commitBoardRename();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void commitBoardRename();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cancelBoardRename();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={cn(
            "block truncate rounded-md px-2 py-1 text-left tracking-tight text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.05]",
            filterCollapsed
              ? "text-base font-semibold leading-tight"
              : "text-2xl font-semibold leading-tight",
          )}
          title="Rename board"
          onClick={() => {
            boardNameBlurModeRef.current = "commit";
            setBoardNameDraft(board.name);
            setEditingBoardName(true);
          }}
        >
          {board.name.trim() || "Untitled"}
        </button>
      )}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.06]"
            title="Board menu"
            aria-label="Board menu"
          >
            <MoreVertical className="size-4 shrink-0" aria-hidden />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="z-[100] min-w-[12rem] rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
            sideOffset={4}
            align="start"
          >
            <DropdownMenu.Item
              className="cursor-pointer rounded px-2 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground"
              onSelect={openBoardEdit}
            >
              Edit board…
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="cursor-pointer rounded px-2 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground"
              onSelect={openGroupsEditor}
            >
              Task groups
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="cursor-pointer rounded px-2 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground"
              onSelect={openPrioritiesEditor}
            >
              Task priorities
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <span
        className="inline-flex shrink-0 items-center"
        title={board.cliPolicy.readBoard ? "CLI Access: Yes" : "CLI Access: Off"}
        aria-label={
          board.cliPolicy.readBoard
            ? "CLI access enabled for this board"
            : "CLI access off for this board"
        }
      >
        <Bot
          className={cn(
            "size-4",
            board.cliPolicy.readBoard
              ? "text-muted-foreground"
              : "text-destructive",
          )}
          strokeWidth={2}
          aria-hidden
        />
      </span>
    </div>
  );
}

function BoardHeaderFilterSummaries() {
  const { filterSummaries } = useBoardHeaderFilters();

  return (
    <div className="hidden shrink-0 items-center gap-2 @min-[900px]:flex">
      {filterSummaries.group ? (
        <div
          className="inline-flex min-w-0 items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
          title={filterSummaries.group.tooltip}
        >
          <span className="uppercase tracking-wide">Group</span>
          <span className="truncate font-medium text-foreground">
            {filterSummaries.group.summary}
          </span>
        </div>
      ) : null}
      {filterSummaries.priority ? (
        <div
          className="inline-flex min-w-0 items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
          title={filterSummaries.priority.tooltip}
        >
          <span className="uppercase tracking-wide">Priority</span>
          {filterSummaries.priority.color ? (
            <span
              className="size-2.5 shrink-0 rounded-full border border-black/30"
              style={{ backgroundColor: filterSummaries.priority.color }}
              aria-hidden
            />
          ) : null}
          <span className="truncate font-medium text-foreground">
            {filterSummaries.priority.summary}
          </span>
        </div>
      ) : null}
      {filterSummaries.release ? (
        <div
          className="inline-flex min-w-0 items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
          title={filterSummaries.release.tooltip}
        >
          <span className="uppercase tracking-wide">Release</span>
          {filterSummaries.release.color ? (
            <span
              className="size-2.5 shrink-0 rounded-full border border-black/30"
              style={{ backgroundColor: filterSummaries.release.color }}
              aria-hidden
            />
          ) : null}
          <span className="truncate font-medium text-foreground">
            {filterSummaries.release.summary}
          </span>
        </div>
      ) : null}
      {filterSummaries.dateSummary ? (
        <div className="inline-flex min-w-0 max-w-[14rem] items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          <span className="uppercase tracking-wide">Dates</span>
          <span
            className="truncate font-medium text-foreground"
            title={filterSummaries.dateSummary}
          >
            {filterSummaries.dateSummary}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function BoardHeaderStats() {
  const board = useBoardHeaderBoard();
  const { boardStatsDisplay, boardStats } = useBoardHeaderStatsRow();

  return (
    <div className="hidden shrink-0 items-center @min-[750px]:flex">
      {board.showStats ? (
        boardStatsDisplay.statsError ? (
          <span
            className="inline-flex items-center text-xs text-destructive"
            role="alert"
          >
            Stats unavailable
          </span>
        ) : (
          <BoardStatsChipsRow
            listCount={board.lists.length}
            stats={boardStats}
            showSpinner={boardStatsDisplay.showChipSpinner}
            entryToken={boardStatsDisplay.entryToken}
          />
        )
      ) : null}
    </div>
  );
}

function BoardHeaderScrollTrack() {
  const { boardSurfaceId } = useBoardHeaderSurface();
  const { headerScroll } = useBoardHeaderShell();

  return (
    <div className="hidden shrink-0 items-center @min-[1100px]:flex">
      <div
        ref={headerScroll.headerScrollTrackRef}
        role="scrollbar"
        aria-controls={boardSurfaceId ?? undefined}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={headerScroll.headerScrollMaxLeft}
        aria-valuenow={Math.round(headerScroll.boardScrollMetrics.scrollLeft)}
        aria-label="Scroll board lists"
        data-board-no-pan
        className={cn(
          "relative h-8 rounded-full border border-border/70 bg-muted/35 transition-opacity",
          headerScroll.headerScrollVisible
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
        style={{ width: "176px" }}
        onPointerDown={headerScroll.onHeaderScrollTrackPointerDown}
        onPointerMove={headerScroll.onHeaderScrollTrackPointerMove}
        onPointerUp={headerScroll.onHeaderScrollTrackPointerUp}
        onPointerCancel={headerScroll.onHeaderScrollTrackPointerCancel}
        onLostPointerCapture={headerScroll.onHeaderScrollTrackLostPointerCapture}
      >
        <div className="pointer-events-none absolute inset-x-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border/70" />
        <div
          data-board-scroll-thumb
          className={cn(
            "absolute top-1/2 h-5 -translate-y-1/2 rounded-full border border-border bg-background/95 shadow-sm",
            headerScroll.headerScrollDragging && "cursor-grabbing",
          )}
          style={{
            left: `${headerScroll.headerScrollThumbOffset}px`,
            width: `${headerScroll.headerScrollThumbWidth}px`,
          }}
        />
      </div>
    </div>
  );
}

function BoardHeaderQuickToggles() {
  const board = useBoardHeaderBoard();

  return (
    <div className="hidden shrink-0 items-center gap-2 @min-[550px]:flex">
      <BoardColorMenu board={board} compact swatchOnly />
      <BoardLayoutToggle board={board} iconsOnly />
      <BoardTaskCardSizeToggle board={board} />
      <BoardStatsVisibilityToggle board={board} />
      <BoardCelebrationSoundToggle board={board} />
    </div>
  );
}

function BoardHeaderCollapseButton() {
  const { filterCollapsed, toggleFilterStrip } = useBoardHeaderShell();

  return (
    <button
      type="button"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-foreground hover:bg-muted"
      title={filterCollapsed ? "Expand header" : "Collapse header"}
      aria-label={filterCollapsed ? "Expand header" : "Collapse header"}
      aria-expanded={!filterCollapsed}
      onClick={toggleFilterStrip}
    >
      {filterCollapsed ? (
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      ) : (
        <ChevronUp className="size-4 shrink-0" aria-hidden />
      )}
    </button>
  );
}

function BoardHeaderFilterStrip() {
  const board = useBoardHeaderBoard();
  const { filterCollapsed, headerScroll } = useBoardHeaderShell();
  const { filterSummaries } = useBoardHeaderFilters();
  const { openGroupsEditor, openPrioritiesEditor, openReleasesEditor } =
    useBoardDialogs();

  if (filterCollapsed) return null;

  return (
    <div className="pointer-events-auto pt-1" data-board-no-pan>
      <div className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-2 2xl:grid-cols-2">
        <div className="min-w-0">
          <TaskGroupSwitcher
            board={board}
            headerHovered={headerScroll.headerHovered}
            onOpenGroupsEditor={openGroupsEditor}
          />
        </div>
        <div className="min-w-0">
          <BoardStatusToggles board={board} />
        </div>
        <div className="min-w-0">
          <BoardPriorityToggles
            board={board}
            headerHovered={headerScroll.headerHovered}
            onOpenPriorityEditor={openPrioritiesEditor}
          />
        </div>
        <div className="min-w-0">
          <BoardTaskDateFilter board={board} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 basis-[min(100%,24rem)]">
            <ReleaseSwitcher
              board={board}
              headerHovered={headerScroll.headerHovered}
              onOpenReleasesEditor={openReleasesEditor}
            />
          </div>
          {filterSummaries.defaultRelease ? (
            <div
              className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
              title={`Default release: ${filterSummaries.defaultRelease.name}`}
            >
              <span className="uppercase tracking-wide">Default</span>
              {filterSummaries.defaultRelease.color ? (
                <span
                  className="size-2.5 shrink-0 rounded-full border border-black/30"
                  style={{
                    backgroundColor: filterSummaries.defaultRelease.color,
                  }}
                  aria-hidden
                />
              ) : null}
              <span className="truncate font-medium text-foreground">
                {filterSummaries.defaultRelease.name}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BoardHeaderComposed(props: BoardHeaderProps) {
  return (
    <BoardHeaderRoot {...props}>
      <BoardHeaderTitleRow>
        <BoardHeaderTitle />
        <BoardHeaderFilterSummaries />
        <BoardHeaderStats />
        <BoardHeaderScrollTrack />
        <BoardHeaderQuickToggles />
        <BoardHeaderCollapseButton />
      </BoardHeaderTitleRow>
      <BoardHeaderFilterStrip />
    </BoardHeaderRoot>
  );
}

export const BoardHeader = Object.assign(BoardHeaderComposed, {
  Root: BoardHeaderRoot,
  TitleRow: BoardHeaderTitleRow,
  Title: BoardHeaderTitle,
  FilterSummaries: BoardHeaderFilterSummaries,
  Stats: BoardHeaderStats,
  ScrollTrack: BoardHeaderScrollTrack,
  QuickToggles: BoardHeaderQuickToggles,
  CollapseButton: BoardHeaderCollapseButton,
  FilterStrip: BoardHeaderFilterStrip,
});
