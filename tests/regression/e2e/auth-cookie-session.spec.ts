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
    await secondTab.getByRole("navigation", { name: "Primary navigation" })
      .locator('button[aria-haspopup="menu"]').click();
    await secondTab.getByRole("menuitem", { name: "Account", exact: true }).click();
    await expect(secondTab).toHaveURL(/\/account$/);
    await expect(secondTab.getByRole("heading", { name: "Account", exact: true })).toBeVisible();

    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(secondTab).toHaveURL(/\/login$/);
  });

  test("shows a neutral authentication check before a fresh anonymous login", async ({ page }) => {
    await page.route("**/session", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.continue();
    });

    await page.goto("/login");

    await expect(page.getByText("Checking authentication")).toBeVisible();
    await expect(page.locator(".auth-check-page")).toBeVisible();
    await expect(page.locator(".login-page")).toHaveCount(0);
    await expect(page.getByText("Checking your session...")).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "Staff login" })).toBeVisible();
    await expect(page.getByText("Checking your session...")).toHaveCount(0);
  });
});

test.describe("HTTP-only cookie expiry", () => {
  test("scheduled session expiry clears the server cookie before showing login", async ({ page, context, baseURL }) => {
    let logoutCalls = 0;
    let authenticated = true;
    // The application expires sessions five seconds early. Allow bootstrap before the timer fires.
    const expiresAt = new Date(Date.now() + 6000).toISOString();
    await context.addCookies([{ name: "ams_access_token", value: "expiry-fixture", url: baseURL!, httpOnly: true, sameSite: "Lax" }]);

    await page.route("**/v1/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace(/^\/v1/, "");

      if (path === "/session" && request.method() === "GET") {
        if (!authenticated) {
          await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "no token provided" }) });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user_id: "user-admin",
            first_name: "Ada",
            last_name: "Admin",
            email: "admin@example.test",
            role: "SUPER_ADMIN",
            status: "ACTIVE",
            expires_at: expiresAt,
            can_manage_user_passwords: true,
          }),
        });
        return;
      }

      if (path === "/logout" && request.method() === "POST") {
        logoutCalls += 1;
        authenticated = false;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "Set-Cookie": "ams_access_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" },
          body: JSON.stringify({ message: "user logged out successfully" }),
        });
        return;
      }

      if (path === "/platform/products" && request.method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [{ product_key: "AMS", product_name: "Asset Management", product_role: "ADMIN", status: "ACTIVE" }] }) });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { page: 1, limit: 20, total: 0, total_pages: 0 } }),
      });
    });

    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login$/);
    await expect.poll(() => logoutCalls).toBe(1);
    await expect(page.getByRole("heading", { name: "Staff login" })).toBeVisible();
    expect((await context.cookies()).some(cookie => cookie.name === "ams_access_token")).toBe(false);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Staff login" })).toBeVisible();
    expect(logoutCalls).toBe(1);
  });
});
