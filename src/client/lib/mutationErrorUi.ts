import { useNotificationUiStore } from "@/store/notificationUi";

const MAX_MSG = 220;

/** Unwrap JSON `{ "error": "..." }` bodies from `fetchJson` failures. */
export function parseApiErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const trimmed = raw.trim();
  try {
    const j = JSON.parse(trimmed) as { error?: unknown };
    if (typeof j.error === "string" && j.error.trim()) return j.error.trim();
  } catch {
    /* keep trimmed */
  }
  if (trimmed.length > 0 && trimmed.length < MAX_MSG) return trimmed;
  return "Something went wrong.";
}

/** Map release API errors to short copy (duplicate name, etc.). */
export function parseReleaseApiErrorMessage(raw: string): string {
  let msg = raw.trim();
  try {
    const j = JSON.parse(raw) as { error?: unknown };
    if (typeof j.error === "string" && j.error.trim()) msg = j.error.trim();
  } catch {
    /* keep msg as body text */
  }
  if (
    /duplicate/i.test(msg) ||
    /Could not create release/i.test(msg) ||
    msg === "Release not found or duplicate name" ||
    /already exists on this board/i.test(msg)
  ) {
    return "A release with this name already exists on this board.";
  }
  if (msg.length > 0 && msg.length < MAX_MSG) return msg;
  return "Could not save.";
}

/**
 * Logs the underlying error and shows a system toast so mutations are not silent
 * when there is no inline error region (per general coding rules).
 */
export function reportMutationError(scope: string, err: unknown): void {
  const msg = parseApiErrorMessage(err);
  console.error(`[mutation ${scope}]`, err);
  useNotificationUiStore.getState().pushSystemToast(msg);
}

export function reportReleaseMutationError(err: unknown): void {
  const raw = err instanceof Error ? err.message : String(err);
  console.error("[mutation release]", err);
  useNotificationUiStore.getState().pushSystemToast(parseReleaseApiErrorMessage(raw));
}
