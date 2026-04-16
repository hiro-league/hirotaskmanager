import { expect, test } from "@playwright/test";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3002";

test.describe("app smoke (Phase 6 infrastructure)", () => {
  test("document title and shell", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Hiro Task Manager/);
  });

  test("auth screen or sidebar after load", async ({ page }) => {
    await page.goto("/");
    // Auth uses a full-page shell (no sidebar); authenticated app uses `AppShell` `<aside>`.
    await expect(
      page
        .getByRole("heading", {
          level: 1,
          name: /Set up TaskManager|Log in to TaskManager/,
        })
        .or(page.locator("aside").getByText("Boards", { exact: true })),
    ).toBeVisible();
  });

  test("API health (dev server)", async ({ request }) => {
    const res = await request.get(`${apiBase}/api/health`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { running?: boolean };
    expect(body.running).toBe(true);
  });
});
