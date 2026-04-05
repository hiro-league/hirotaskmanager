import {
  TASK_MANAGER_CLIENT_HEADER,
  TASK_MANAGER_CLIENT_INSTANCE_HEADER,
  TASK_MANAGER_CLIENT_NAME_HEADER,
} from "../../shared/boardCliAccess";

const BROWSER_CLIENT_ID = "web";
/** Display name for notifications (`ui` source); matches server default in `parseNotificationClientContext`. */
const BROWSER_CLIENT_NAME = "User";
const BROWSER_CLIENT_INSTANCE_STORAGE_KEY = "tm:webClientInstanceId";

let cachedBrowserClientInstanceId: string | null = null;

function generateClientInstanceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Keep one stable browser instance id per tab so own-write filtering can identify this session. */
export function getBrowserClientInstanceId(): string {
  if (cachedBrowserClientInstanceId) return cachedBrowserClientInstanceId;
  if (typeof sessionStorage === "undefined") {
    cachedBrowserClientInstanceId = generateClientInstanceId();
    return cachedBrowserClientInstanceId;
  }
  const existing = sessionStorage.getItem(BROWSER_CLIENT_INSTANCE_STORAGE_KEY)?.trim();
  if (existing) {
    cachedBrowserClientInstanceId = existing;
    return existing;
  }
  const created = generateClientInstanceId();
  sessionStorage.setItem(BROWSER_CLIENT_INSTANCE_STORAGE_KEY, created);
  cachedBrowserClientInstanceId = created;
  return created;
}

/** Apply default browser client metadata unless the caller already provided a more specific value. */
export function withBrowserClientHeaders(input?: HeadersInit): Headers {
  const headers = new Headers(input);
  if (!headers.has(TASK_MANAGER_CLIENT_HEADER)) {
    headers.set(TASK_MANAGER_CLIENT_HEADER, BROWSER_CLIENT_ID);
  }
  if (!headers.has(TASK_MANAGER_CLIENT_NAME_HEADER)) {
    headers.set(TASK_MANAGER_CLIENT_NAME_HEADER, BROWSER_CLIENT_NAME);
  }
  if (!headers.has(TASK_MANAGER_CLIENT_INSTANCE_HEADER)) {
    headers.set(TASK_MANAGER_CLIENT_INSTANCE_HEADER, getBrowserClientInstanceId());
  }
  return headers;
}
