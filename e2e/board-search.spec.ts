import { expect, test } from "@playwright/test";
import {
  apiCreateBoard,
  apiCreateList,
  apiCreateTask,
  dismissShortcutHelpIfPresent,
  ensureWebSession,
} from "./helpers/e2eSession";

/**
 * Phase 11 — selective E2E: board-scoped FTS in a real browser.
 * Complements `BoardSearchDialog` RTL tests (`debounced fetch`, hit rows) with header open + network.
 * Reason: regressions only show up when the full stack (shortcut scope, React Query, SQLite FTS) runs together.
 */
test.describe("Phase 11 board search (FTS)", () => {
  test.beforeEach(async ({ page }) => {
    await ensureWebSession(page);
  });

  test("opens header search, types a query, and lists a matching task", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const ftsToken = `ftse2e${suffix.replace(/-/g, "")}`;
    const taskTitle = `E2E search hit ${ftsToken}`;
    const boardId = await apiCreateBoard(page, `E2E FTS board ${suffix}`);
    await apiCreateList(page, boardId, `E2E Col ${suffix}`);
    await apiCreateTask(page, boardId, taskTitle);

    await page.goto(`/board/${boardId}`);
    await dismissShortcutHelpIfPresent(page);

    await page.getByRole("button", { name: "Search tasks on this board" }).click();

    const searchInput = page.getByPlaceholder(/Search tasks on this board/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill(ftsToken);

    // Scope to the search dialog (other `role="dialog"` modals can exist briefly).
    const searchDialog = page
      .getByRole("dialog")
      .filter({ has: page.getByPlaceholder(/Search tasks on this board/i) });
    await expect(searchDialog.getByText(taskTitle, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
