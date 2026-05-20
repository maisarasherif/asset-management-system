import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD;

test.describe("HTTP-only cookie session", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run E2E tests."
  );

  test("restores login in a fresh tab and logs out other tabs", async ({ context, page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill(ADMIN_EMAIL!);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    const cookies = await context.cookies();
    const accessCookie = cookies.find((cookie) => cookie.name === "ams_access_token");
    expect(accessCookie).toBeTruthy();
    expect(accessCookie?.httpOnly).toBe(true);

    const secondTab = await context.newPage();
    await secondTab.goto("/assets");
    await expect(secondTab).toHaveURL(/\/assets$/);
    await expect(
      secondTab.getByRole("link", { name: "Account" })
    ).toBeVisible();

    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(secondTab).toHaveURL(/\/login$/);
  });
});
