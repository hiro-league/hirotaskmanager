import { expect, test } from "@playwright/test";
import {
  apiCreateBoard,
  apiCreateList,
  apiCreateTask,
  apiLoadBoard,
  dismissShortcutHelpIfPresent,
  ensureWebSession,
} from "./helpers/e2eSession";

test.describe.configure({ mode: "serial" });

test.describe("Phase 7 board journeys", () => {
  test.beforeEach(async ({ page }) => {
    await ensureWebSession(page);
  });

  test("board load: column renders on the board page", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const boardName = `E2E Load ${suffix}`;
    const listName = `E2E Column ${suffix}`;
    const boardId = await apiCreateBoard(page, boardName);
    await apiCreateList(page, boardId, listName);

    await page.goto(`/board/${boardId}`);
    await dismissShortcutHelpIfPresent(page);

    await expect(page.getByText(boardName, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(listName, { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel(`${listName} — tasks`)).toBeVisible();
  });

  test("create task: quick-add composer adds a visible card", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const boardId = await apiCreateBoard(page, `E2E Create ${suffix}`);
    const listName = `E2E Col ${suffix}`;
    await apiCreateList(page, boardId, listName);
    const taskTitle = `E2E new task ${suffix}`;

    await page.goto(`/board/${boardId}`);
    await dismissShortcutHelpIfPresent(page);

    // Click near the top of the tasks region: the bottom-anchored "Add task" FAB
    // (Composer.Fab) overlays the geometric center of an empty list and intercepts
    // the default center click on CI (see Playwright "subtree intercepts pointer
    // events" failure). Targeting the top edge focuses the list without racing the FAB.
    await page
      .getByLabel(`${listName} — tasks`)
      .click({ position: { x: 12, y: 12 } });
    await page.keyboard.press("t");
    await page
      .getByPlaceholder("Enter a title or paste a link")
      .fill(taskTitle);
    await page.getByRole("button", { name: "Add task", exact: true }).click();

    await expect(
      page.locator("[data-task-card-root]").filter({ hasText: taskTitle }),
    ).toBeVisible();
  });

  test("edit task: TaskEditor save updates the card title", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const boardId = await apiCreateBoard(page, `E2E Edit ${suffix}`);
    await apiCreateList(page, boardId, `E2E Col ${suffix}`);
    const original = `E2E edit me ${suffix}`;
    const updated = `E2E edited ${suffix}`;
    await apiCreateTask(page, boardId, original);

    await page.goto(`/board/${boardId}`);
    await dismissShortcutHelpIfPresent(page);

    // Click near the top-left of the card: the bottom-anchored "Add task" FAB
    // (Composer.Fab) fades in on column hover and intercepts clicks targeting
    // the card's geometric center on a sparse list. Same workaround the
    // create-task test uses for the empty-list FAB collision (see line ~48).
    await page
      .locator("[data-task-card-root]")
      .filter({ hasText: original })
      .click({ position: { x: 12, y: 12 } });
    await page.getByRole("dialog").getByPlaceholder("Title").fill(updated);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(
      page.locator("[data-task-card-root]").filter({ hasText: updated }),
    ).toBeVisible();
    await expect(
      page.locator("[data-task-card-root]").filter({ hasText: original }),
    ).toHaveCount(0);
  });

  test("reorder: drag one open task card onto another (DnD smoke)", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const boardId = await apiCreateBoard(page, `E2E DnD ${suffix}`);
    await apiCreateList(page, boardId, `E2E Col ${suffix}`);
    const t1 = `E2E dnd A ${suffix}`;
    const t2 = `E2E dnd B ${suffix}`;
    await apiCreateTask(page, boardId, t1);
    await apiCreateTask(page, boardId, t2);

    await page.goto(`/board/${boardId}`);
    await dismissShortcutHelpIfPresent(page);

    const a = page.locator("[data-task-card-root]").filter({ hasText: t1 });
    const b = page.locator("[data-task-card-root]").filter({ hasText: t2 });
    await expect(a).toBeVisible();
    await expect(b).toBeVisible();

    // Baseline must be read before any drag; the sortable ref is on the outer
    // row wrapping TaskCard, not on [data-task-card-root] (board surface also
    // uses cursor-grab, so we take the card root's parent — the sortable row).
    const before = await apiLoadBoard(page, boardId);
    const key = (t: { title: string; order: number }) =>
      `${t.title}:${t.order}`;
    const ordersBefore = before.tasks
      .filter((t) => t.title === t1 || t.title === t2)
      .map(key)
      .sort();

    const rowA = page
      .locator("[data-task-card-root]")
      .filter({ hasText: t1 })
      .locator("xpath=..");
    const rowB = page
      .locator("[data-task-card-root]")
      .filter({ hasText: t2 })
      .locator("xpath=..");
    await rowA.dragTo(rowB, { force: true, steps: 20 });

    await expect
      .poll(
        async () => {
          const next = await apiLoadBoard(page, boardId);
          const ordersAfter = next.tasks
            .filter((t) => t.title === t1 || t.title === t2)
            .map(key)
            .sort();
          return ordersAfter.join("|") !== ordersBefore.join("|");
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  });
});
