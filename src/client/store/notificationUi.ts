import { create } from "zustand";
import type { NotificationItem } from "../../shared/notifications";

export type NotificationToast = {
  id: number;
  notification: NotificationItem;
};

/** Ephemeral UI message (not a persisted notification row). */
export type SystemToast = {
  id: number;
  message: string;
};

type NotificationUiState = {
  panelOpen: boolean;
  setPanelOpen: (value: boolean) => void;
  toasts: NotificationToast[];
  pushToast: (notification: NotificationItem) => void;
  dismissToast: (id: number) => void;
  clearToasts: () => void;
  /** One-shot banner (e.g. SSE connection pool exhaustion). */
  systemToast: SystemToast | null;
  pushSystemToast: (message: string) => void;
  dismissSystemToast: () => void;
};

export const useNotificationUiStore = create<NotificationUiState>((set) => ({
  panelOpen: false,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  toasts: [],
  pushToast: (notification) =>
    set((state) => {
      const next = [{ id: notification.id, notification }, ...state.toasts];
      return { toasts: next.slice(0, 3) };
    }),
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  clearToasts: () => set({ toasts: [] }),
  systemToast: null,
  pushSystemToast: (message) =>
    set({ systemToast: { id: Date.now(), message } }),
  dismissSystemToast: () => set({ systemToast: null }),
}));
