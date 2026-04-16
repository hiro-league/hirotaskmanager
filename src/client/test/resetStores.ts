import { useNotificationUiStore } from "@/store/notificationUi";

/** Clears ephemeral notification UI state between tests (toasts, panel, system banner). */
export function resetNotificationUiStore(): void {
  useNotificationUiStore.setState({
    panelOpen: false,
    toasts: [],
    systemToast: null,
  });
}
