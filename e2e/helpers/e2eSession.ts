import { expect, type Page } from "@playwright/test";

/** Fixed passphrase for disposable E2E scratch DBs (Phase 7 journeys). */
export const E2E_PASSPHRASE = "e2e-playwright-passphrase-2026";

/**
 * Walks the real auth shell so the session cookie is set on the Vite origin (proxy + credentialed fetch).
 * API-only login via `page.request` did not reliably attach cookies in this setup.
 */
export async function ensureWebSession(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Set up TaskManager|Log in to TaskManager/,
    }),
  ).toBeVisible({ timeout: 20_000 });

  const setupHeading = page.getByRole("heading", {
    name: "Set up TaskManager",
  });
  if (await setupHeading.isVisible()) {
    await page.getByLabel("Passphrase", { exact: true }).fill(E2E_PASSPHRASE);
    await page.getByLabel("Confirm passphrase").fill(E2E_PASSPHRASE);
    await page.getByRole("button", { name: "Create passphrase" }).click();
    await expect(
      page.getByRole("heading", { name: "Log in to TaskManager" }),
    ).toBeVisible({ timeout: 20_000 });
  }

  const loginHeading = page.getByRole("heading", {
    name: "Log in to TaskManager",
  });
  if (await loginHeading.isVisible()) {
    await page.getByLabel("Passphrase", { exact: true }).fill(E2E_PASSPHRASE);
    await page.getByRole("button", { name: "Log in" }).click();
  }

  await expect(
    page.locator("aside").getByText("Boards", { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
}

export async function apiCreateBoard(page: Page, name: string): Promise<number> {
  const res = await page.request.post("/api/boards", {
    data: { name },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { boardId: number };
  return body.boardId;
}

export async function apiCreateList(
  page: Page,
  boardId: number,
  name: string,
): Promise<void> {
  const res = await page.request.post(`/api/boards/${boardId}/lists`, {
    data: { name },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.ok()).toBeTruthy();
}

type BoardJson = {
  lists: { listId: number; name: string }[];
  taskGroups: { groupId: number }[];
  defaultTaskGroupId: number;
  tasks: { taskId: number; title: string; listId: number; order: number }[];
};

export async function apiLoadBoard(page: Page, boardId: number): Promise<BoardJson> {
  const res = await page.request.get(`/api/boards/${boardId}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as BoardJson;
}

export async function apiCreateTask(
  page: Page,
  boardId: number,
  title: string,
): Promise<number> {
  const board = await apiLoadBoard(page, boardId);
  const listId = board.lists[0]?.listId;
  const groupId = board.defaultTaskGroupId || board.taskGroups[0]?.groupId;
  expect(listId).toBeTruthy();
  expect(groupId).toBeTruthy();
  const res = await page.request.post(`/api/boards/${boardId}/tasks`, {
    data: {
      listId,
      groupId,
      title,
      body: "",
      status: "open",
    },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.ok()).toBeTruthy();
  const next = (await res.json()) as BoardJson;
  const task = next.tasks.find((t) => t.title === title);
  expect(task?.taskId).toBeTruthy();
  return task!.taskId;
}

/** First-run shortcut help auto-opens on board load; close so shortcuts and the board surface work. */
export async function dismissShortcutHelpIfPresent(page: Page): Promise<void> {
  const close = page.getByRole("dialog").getByRole("button", { name: "Close" });
  try {
    await close.waitFor({ state: "visible", timeout: 4000 });
    await close.click();
  } catch {
    /* no dialog — already dismissed or prefs skip auto-open */
  }
}
