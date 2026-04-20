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
  /** Board soft-delete: call restore API (#31351). */
  onUndo?: () => void;
  /** Board soft-delete: navigate to Trash (#31351). */
  trashLink?: boolean;
};

export type SystemToastInput =
  | string
  | Pick<SystemToast, "message"> &
      Partial<Pick<SystemToast, "onUndo" | "trashLink">>;

type NotificationUiState = {
  panelOpen: boolean;
  setPanelOpen: (value: boolean) => void;
  toasts: NotificationToast[];
  pushToast: (notification: NotificationItem) => void;
  dismissToast: (id: number) => void;
  clearToasts: () => void;
  /** One-shot banner (e.g. SSE connection pool exhaustion). */
  systemToast: SystemToast | null;
  pushSystemToast: (input: SystemToastInput) => void;
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
  pushSystemToast: (input) =>
    set(() => {
      const id = Date.now();
      if (typeof input === "string") {
        return { systemToast: { id, message: input } };
      }
      const next: SystemToast = {
        id,
        message: input.message,
      };
      if (input.onUndo) next.onUndo = input.onUndo;
      if (input.trashLink) next.trashLink = true;
      return { systemToast: next };
    }),
  dismissSystemToast: () => set({ systemToast: null }),
}));
