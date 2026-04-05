import { create } from "zustand";
import type { NotificationItem } from "../../shared/notifications";

export type NotificationToast = {
  id: number;
  notification: NotificationItem;
};

type NotificationUiState = {
  panelOpen: boolean;
  setPanelOpen: (value: boolean) => void;
  toasts: NotificationToast[];
  pushToast: (notification: NotificationItem) => void;
  dismissToast: (id: number) => void;
  clearToasts: () => void;
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
}));
