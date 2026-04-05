import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { NotificationCreatedEvent } from "../../shared/notifications";
import { getBrowserClientInstanceId } from "./clientHeaders";
import { invalidateNotificationQueries } from "./notifications";
import { useNotificationUiStore } from "@/store/notificationUi";

function notificationEventsUrl(): string {
  const path = "/api/notifications/events";
  if (import.meta.env.PROD) return path;
  const raw = import.meta.env.VITE_API_ORIGIN as string | undefined;
  const origin =
    raw && raw.length > 0 ? raw.replace(/\/$/, "") : "http://127.0.0.1:3001";
  return `${origin}${path}`;
}

/** Shell-level notification SSE: refresh feed state and surface live toast cards. */
export function useNotificationStream(): void {
  const qc = useQueryClient();
  const panelOpen = useNotificationUiStore((s) => s.panelOpen);
  const pushToast = useNotificationUiStore((s) => s.pushToast);

  useEffect(() => {
    const es = new EventSource(notificationEventsUrl());
    const browserInstanceId = getBrowserClientInstanceId();

    const onNotificationCreated = (raw: Event) => {
      const event = JSON.parse((raw as MessageEvent<string>).data) as NotificationCreatedEvent;
      invalidateNotificationQueries(qc);
      if (panelOpen) return;
      if (event.notification.clientInstanceId === browserInstanceId) return;
      const st = event.notification.sourceType;
      if (st !== "cli" && st !== "system") return;
      pushToast(event.notification);
    };

    es.addEventListener("notification-created", onNotificationCreated);
    return () => {
      es.removeEventListener("notification-created", onNotificationCreated);
      es.close();
    };
  }, [panelOpen, pushToast, qc]);
}
