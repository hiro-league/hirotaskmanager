import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { NotificationItem } from "../../../shared/notifications";
import {
  notificationActionVisual,
  notificationContextLabel,
  notificationEntityIcon,
  notificationSourceDisplay,
  notificationTargetHref,
} from "@/lib/notificationPresentation";
import { formatNotificationTime } from "@/lib/notificationTime";
import { cn } from "@/lib/utils";
import { useNotificationUiStore } from "@/store/notificationUi";

function ToastCard({ item, onDismiss }: { item: NotificationItem; onDismiss: () => void }) {
  const navigate = useNavigate();
  const setPanelOpen = useNotificationUiStore((s) => s.setPanelOpen);
  const source = notificationSourceDisplay(item);
  const SourceGlyph = source.Icon;
  const EntityIcon = notificationEntityIcon(item.entityType);
  const { Icon, className } = notificationActionVisual(item);
  const context = notificationContextLabel(item);
  const destination = notificationTargetHref(item);

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(), 4500);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

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
        </div>
      </div>
    </button>
  );
}

function SystemToastCard({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(), 12_000);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="pointer-events-auto rounded-xl border border-amber-500/40 bg-amber-950/90 p-3 text-sm text-amber-50 shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 leading-5">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
        >
          Dismiss
        </button>
      </div>
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
          message={systemToast.message}
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
