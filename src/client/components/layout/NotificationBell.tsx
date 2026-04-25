import { useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Bell,
  Bot,
  Inbox,
  LayoutGrid,
  Loader2,
  Settings,
  User,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { NotificationItem } from "../../../shared/notifications";
import { useMarkAllNotificationsRead, useNotificationsFeed } from "@/api/notifications";
import { parseBoardIdFromPath } from "@/lib/boardPath";
import {
  notificationActionVisual,
  notificationContextLabel,
  notificationEntityIcon,
  notificationRestoreTarget,
  notificationSourceDisplay,
  notificationTargetHref,
} from "@/lib/notificationPresentation";
import { NotificationRestoreButton } from "./NotificationRestoreButton";
import { formatNotificationTime } from "@/lib/notificationTime";
import { formatInteger } from "@/lib/intlNumberFormat";
import { cn } from "@/lib/utils";
import { useNotificationUiStore } from "@/store/notificationUi";
import { usePreferencesStore } from "@/store/preferences";

function NotificationRow({
  item,
  onNavigate,
}: {
  item: NotificationItem;
  onNavigate: (path: string) => void;
}) {
  const source = notificationSourceDisplay(item);
  const SourceGlyph = source.Icon;
  const EntityIcon = notificationEntityIcon(item.entityType);
  const { Icon, className } = notificationActionVisual(item);
  const destination = notificationTargetHref(item);
  const context = notificationContextLabel(item);
  const restoreTarget = notificationRestoreTarget(item);
  const content = (
    <div
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        item.readAt == null
          ? "border-primary/20 bg-primary/5"
          : "border-border/70 bg-background/60",
        destination && "hover:bg-accent/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full",
          className,
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <p className="flex min-w-0 flex-1 items-start gap-1.5 text-sm font-medium leading-5 text-foreground">
            <EntityIcon
              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="min-w-0">{item.message}</span>
          </p>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatNotificationTime(item.createdAt)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span
            className={cn("inline-flex items-center gap-1", source.className)}
          >
            <SourceGlyph className="size-3.5 shrink-0" aria-hidden />
            {source.label}
          </span>
          {context ? <span className="truncate">{context}</span> : null}
        </div>
        {restoreTarget ? (
          <div className="mt-2">
            <NotificationRestoreButton target={restoreTarget} />
          </div>
        ) : null}
      </div>
    </div>
  );

  if (!destination) return <div>{content}</div>;
  return (
    <button type="button" className="w-full" onClick={() => onNavigate(destination)}>
      {content}
    </button>
  );
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const currentBoardParam = parseBoardIdFromPath(pathname);
  const currentBoardId =
    currentBoardParam && /^\d+$/.test(currentBoardParam) ? Number(currentBoardParam) : null;
  const { open, setOpen, clearToasts } = useNotificationUiStore(
    useShallow((s) => ({
      open: s.panelOpen,
      setOpen: s.setPanelOpen,
      clearToasts: s.clearToasts,
    })),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  const {
    scopePreference,
    setScopePreference,
    sourceFilter,
    setSourceFilter,
  } = usePreferencesStore(
    useShallow((s) => ({
      scopePreference: s.notificationPanelScopePreference,
      setScopePreference: s.setNotificationPanelScopePreference,
      sourceFilter: s.notificationSourceFilter,
      setSourceFilter: s.setNotificationSourceFilter,
    })),
  );

  const resolvedScope = scopePreference === "current" && currentBoardId != null ? "board" : "all";
  const feed = useNotificationsFeed({
    scope: resolvedScope,
    boardId: resolvedScope === "board" ? currentBoardId : null,
    sourceFilter,
  });
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!open) return;
    void feed.refetch();
    void markAllRead.mutateAsync().catch(() => undefined);
    clearToasts();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const unreadCount = feed.data?.unreadCount ?? 0;
  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);
  const items = feed.data?.items ?? [];
  const currentBoardUnavailable = currentBoardId == null;
  const panelTitle = useMemo(() => {
    if (resolvedScope === "board" && currentBoardId != null) return "Current board activity";
    return "All activity";
  }, [currentBoardId, resolvedScope]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        title="Notifications"
        className={cn(
          "relative inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/70 text-foreground shadow-sm",
          "transition-[color,background-color,box-shadow] hover:bg-muted hover:shadow",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-header",
          "active:translate-y-px active:shadow-sm",
        )}
      >
        <Bell className="size-5 shrink-0" aria-hidden />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground shadow-sm">
            {badgeText}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-[120] mt-2 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{panelTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {feed.isFetching
                    ? "Refreshing…"
                    : `${formatInteger(items.length)} visible item${items.length === 1 ? "" : "s"}`}
                </p>
              </div>
              {feed.isFetching ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
              ) : null}
            </div>
          </div>

          <div className="border-b border-border px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Boards:
                </span>
                <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
                  <button
                    type="button"
                    onClick={() => setScopePreference("all")}
                    className={cn(
                      "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      scopePreference === "all"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    disabled={currentBoardUnavailable}
                    onClick={() => setScopePreference("current")}
                    className={cn(
                      "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      scopePreference === "current" && !currentBoardUnavailable
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      currentBoardUnavailable &&
                        "cursor-not-allowed opacity-45 hover:text-muted-foreground",
                    )}
                    title={
                      currentBoardUnavailable
                        ? "Open a board to use Current scope"
                        : "Current board only"
                    }
                  >
                    Current
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Source:
                </span>
                <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
                  {(
                    [
                      {
                        value: "all" as const,
                        Icon: LayoutGrid,
                        title: "All sources",
                      },
                      {
                        value: "ui" as const,
                        Icon: User,
                        title: "User (web app)",
                      },
                      {
                        value: "cli" as const,
                        Icon: Bot,
                        title: "CLI (hirotm)",
                      },
                      {
                        value: "system" as const,
                        Icon: Settings,
                        title: "System",
                      },
                    ] as const
                  ).map(({ value, Icon: SrcIcon, title }) => (
                    <button
                      key={value}
                      type="button"
                      title={title}
                      aria-label={title}
                      aria-pressed={sourceFilter === value}
                      onClick={() => setSourceFilter(value)}
                      className={cn(
                        "inline-flex size-8 items-center justify-center rounded transition-colors",
                        sourceFilter === value
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <SrcIcon className="size-4 shrink-0" aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="max-h-[26rem] overflow-y-auto p-3">
            {feed.isLoading && items.length === 0 ? (
              <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden />
                Loading notifications…
              </div>
            ) : items.length === 0 ? (
              <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <Inbox className="size-6" aria-hidden />
                {resolvedScope === "board"
                  ? "No notifications for this board yet."
                  : "No notifications yet."}
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    onNavigate={(path) => {
                      setOpen(false);
                      navigate(path);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
