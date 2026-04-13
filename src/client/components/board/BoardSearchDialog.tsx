import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { Board, SearchHit } from "../../../shared/models";
import { fetchBoardSearchHits } from "@/api/search";
import { useBoardTaskKeyboardBridge } from "@/components/board/shortcuts/BoardTaskKeyboardBridge";
import { useBackdropDismissClick } from "@/components/board/shortcuts/useBackdropDismissClick";
import { useDialogCloseRequest } from "@/components/board/shortcuts/useDialogCloseRequest";
import { useShortcutOverlay } from "@/components/board/shortcuts/ShortcutScopeContext";
import { useBodyScrollLock } from "@/components/board/shortcuts/bodyScrollLock";
import {
  MODAL_BACKDROP_SURFACE_CLASS,
  MODAL_DIALOG_OVERSCROLL_CLASS,
  MODAL_TEXT_FIELD_CURSOR_CLASS,
} from "@/components/board/shortcuts/modalOverlayClasses";
import { useModalFocusTrap } from "@/components/board/shortcuts/useModalFocusTrap";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 250;
const MAX_LIMIT = 30;

interface BoardSearchDialogProps {
  board: Board;
  open: boolean;
  onClose: () => void;
}

/**
 * Board-scoped task search (FTS). Opens from the app header (on a board), or K / F3; choosing a row opens the task editor like a card click.
 */
export function BoardSearchDialog({
  board,
  open,
  onClose,
}: BoardSearchDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { requestOpenTaskEditor } = useBoardTaskKeyboardBridge();

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDebouncedQuery("");
    setHits([]);
    setFetchError(null);
  }, [open, board.boardId]);

  useEffect(() => {
    if (!open) return;
    if (debouncedQuery.length === 0) {
      setHits([]);
      setLoading(false);
      setFetchError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    fetchBoardSearchHits(debouncedQuery, board.boardId, { limit: MAX_LIMIT })
      .then((data) => {
        if (!cancelled) setHits(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setHits([]);
          setFetchError(e instanceof Error ? e.message : "Search failed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, board.boardId, debouncedQuery]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const requestClose = useDialogCloseRequest({
    busy: false,
    onClose,
  });

  const keyHandler = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    },
    [requestClose],
  );

  useShortcutOverlay(open, "board-search-dialog", keyHandler);
  useModalFocusTrap({
    open,
    containerRef: dialogRef,
    initialFocusRef: inputRef,
  });

  const backdropDismiss = useBackdropDismissClick(requestClose);

  useBodyScrollLock(open);

  const pickHit = useCallback(
    (taskId: number) => {
      requestOpenTaskEditor(taskId);
      onClose();
    },
    [onClose, requestOpenTaskEditor],
  );

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[75] flex items-start justify-center bg-black/50 p-4 pt-[min(12vh,8rem)]",
        MODAL_BACKDROP_SURFACE_CLASS,
      )}
      role="presentation"
      onPointerDown={backdropDismiss.onPointerDown}
      onClick={backdropDismiss.onClick}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          "flex max-h-[min(70vh,520px)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg",
          MODAL_TEXT_FIELD_CURSOR_CLASS,
        )}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <input
            ref={inputRef}
            id={titleId}
            type="search"
            autoComplete="off"
            placeholder="Search tasks on this board…"
            className="min-w-0 flex-1 bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[0]) {
                e.preventDefault();
                pickHit(hits[0].taskId);
              }
            }}
          />
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-1 py-1",
            MODAL_DIALOG_OVERSCROLL_CLASS,
          )}
        >
          {fetchError ? (
            <p className="px-3 py-4 text-sm text-destructive">{fetchError}</p>
          ) : loading && debouncedQuery.length > 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Searching…</p>
          ) : debouncedQuery.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              Type to search titles, descriptions, list names, groups, and status
              labels.
            </p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No matches.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {hits.map((h) => (
                <li key={h.taskId}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left text-sm",
                      "hover:bg-muted/80 focus-visible:bg-muted/80 focus-visible:outline-none",
                    )}
                    onClick={() => pickHit(h.taskId)}
                  >
                    <span className="font-medium text-foreground">{h.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {h.listName}
                    </span>
                    {h.snippet ? (
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {h.snippet}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
