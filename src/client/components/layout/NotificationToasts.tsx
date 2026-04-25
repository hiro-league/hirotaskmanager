import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { NotificationItem } from "../../../shared/notifications";
import {
  notificationActionVisual,
  notificationContextLabel,
  notificationEntityIcon,
  notificationRestoreTarget,
  notificationSourceDisplay,
  notificationTargetHref,
} from "@/lib/notificationPresentation";
import { formatNotificationTime } from "@/lib/notificationTime";
import { cn } from "@/lib/utils";
import type { SystemToast } from "@/store/notificationUi";
import { useNotificationUiStore } from "@/store/notificationUi";
import { NotificationRestoreButton } from "./NotificationRestoreButton";

function ToastCard({ item, onDismiss }: { item: NotificationItem; onDismiss: () => void }) {
  const navigate = useNavigate();
  const setPanelOpen = useNotificationUiStore((s) => s.setPanelOpen);
  const source = notificationSourceDisplay(item);
  const SourceGlyph = source.Icon;
  const EntityIcon = notificationEntityIcon(item.entityType);
  const { Icon, className } = notificationActionVisual(item);
  const context = notificationContextLabel(item);
  const destination = notificationTargetHref(item);
  const restoreTarget = notificationRestoreTarget(item);

  useEffect(() => {
    // Trash-action toasts get the same generous window as the Undo system toast so users have
    // time to react before auto-dismiss; other notification toasts stay short and unobtrusive.
    const ms = restoreTarget ? 15_000 : 4500;
    const timer = window.setTimeout(() => onDismiss(), ms);
    return () => window.clearTimeout(timer);
  }, [onDismiss, restoreTarget]);

  return (
    <button
      type="button"
      onClick={() => {
        onDismiss();
        if (destination) {
          navigate(destination);
          return;
        }
        setPanelOpen(true);
      }}
      className="w-full rounded-xl border border-border bg-popover/95 p-3 text-left text-popover-foreground shadow-xl backdrop-blur hover:bg-accent/30"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full",
            className,
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="flex min-w-0 flex-1 items-start gap-1.5 text-sm font-medium leading-5">
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
              <NotificationRestoreButton
                target={restoreTarget}
                onRestored={onDismiss}
              />
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function SystemToastCard({
  toast,
  onDismiss,
}: {
  toast: SystemToast;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  const hasActions = Boolean(toast.onUndo || toast.trashLink);
  useEffect(() => {
    // Board trash toast: give time to undo (#31351); errors stay dismiss-only.
    const ms = hasActions ? 15_000 : 12_000;
    const timer = window.setTimeout(() => onDismiss(), ms);
    return () => window.clearTimeout(timer);
  }, [hasActions, onDismiss]);

  return (
    <div
      className={cn(
        "pointer-events-auto rounded-xl border bg-popover/95 p-3 text-sm text-popover-foreground shadow-xl backdrop-blur",
        // Match ToastCard surface; light primary ring when Undo / Trash are offered.
        hasActions ? "border-primary/25" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 leading-5">{toast.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
      {hasActions ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {toast.onUndo ? (
            <button
              type="button"
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
              onClick={() => {
                toast.onUndo?.();
                onDismiss();
              }}
            >
              Undo
            </button>
          ) : null}
          {toast.trashLink ? (
            <button
              type="button"
              className="rounded-md border border-border bg-background/60 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
              onClick={() => {
                onDismiss();
                navigate("/trash");
              }}
            >
              Open Trash
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function NotificationToasts() {
  const toasts = useNotificationUiStore((s) => s.toasts);
  const dismissToast = useNotificationUiStore((s) => s.dismissToast);
  const systemToast = useNotificationUiStore((s) => s.systemToast);
  const dismissSystemToast = useNotificationUiStore((s) => s.dismissSystemToast);

  if (toasts.length === 0 && !systemToast) return null;

  return (
    // aria-live: new toasts are announced (Web Interface Guidelines — async updates).
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed bottom-4 right-4 z-[140] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {systemToast ? (
        <SystemToastCard
          key={systemToast.id}
          toast={systemToast}
          onDismiss={dismissSystemToast}
        />
      ) : null}
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastCard item={toast.notification} onDismiss={() => dismissToast(toast.id)} />
        </div>
      ))}
    </div>
  );
}
