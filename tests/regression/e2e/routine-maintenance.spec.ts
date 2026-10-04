import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:8080/v1";
const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const RUN_NOTIFICATION_TRIGGER =
  process.env.PLAYWRIGHT_RUN_ROUTINE_MAINTENANCE_TRIGGER === "1";

interface Asset {
  asset_id: string;
  name: string;
  working_hours: number;
  maintenance_interval_hours: number;
  next_maintenance_due_hours: number;
}

async function loginApi(request: APIRequestContext) {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD must be set to run E2E tests."
    );
  }

  const response = await request.post(`${API_BASE_URL}/login`, {
    data: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  });

  expect(response.ok()).toBeTruthy();

  const body = (await response.json()) as { token: string };
  return body.token;
}

async function createAsset(request: APIRequestContext, token: string, name: string, projectName: string) {
  const response = await request.post(`${API_BASE_URL}/asset`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name,
      photo: "",
      datasheet: "",
      description: "Created by Playwright to verify routine maintenance.",
      status: "ACTIVE",
      location: "E2E Yard",
      assigned_project: projectName,
      maintenance_interval_hours: 100,
      template_id: null,
    },
  });

  expect(response.ok(), `create maintenance asset: ${response.status()} ${await response.text()}`).toBeTruthy();
  return (await response.json()) as Asset;
}

async function deleteAsset(request: APIRequestContext, token: string, assetId: string) {
  const response = await request.delete(`${API_BASE_URL}/asset/${assetId}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10_000,
  });

  expect([200, 404]).toContain(response.status());
}

test.describe("routine maintenance browser flow", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run E2E tests."
  );

  test.skip(
    !RUN_NOTIFICATION_TRIGGER,
    "Set PLAYWRIGHT_RUN_ROUTINE_MAINTENANCE_TRIGGER=1 in a test environment to verify the threshold-trigger flow."
  );

  test("admin can update hours, trigger maintenance, and complete the cycle", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const assetName = `PW Maintenance Asset ${suffix}`;
    const cleanupRequest = await playwrightRequest.newContext();
    let token = await loginApi(cleanupRequest);
    let assetId: string | null = null;
    let projectId: string | null = null;
    let failed = false;

    try {
      const projectResponse = await cleanupRequest.post(`${API_BASE_URL}/project`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { project_name: `PW Maintenance Project ${suffix}`, description: "Routine maintenance fixture", status: "ACTIVE" },
      });
      expect(projectResponse.status(), await projectResponse.text()).toBe(201);
      const project = await projectResponse.json();
      projectId = project.project_id;
      const asset = await createAsset(cleanupRequest, token, assetName, project.project_name);
      assetId = asset.asset_id;
      await page.goto("/login");

      await page.getByLabel("Email").fill(ADMIN_EMAIL!);
      await page.getByLabel("Password").fill(ADMIN_PASSWORD!);
      const browserLogin = page.waitForResponse(response => response.url() === `${API_BASE_URL}/login` && response.request().method() === "POST");
      await page.getByRole("button", { name: "Sign in" }).click();
      const loginResponse = await browserLogin;
      expect(loginResponse.status()).toBe(200);
      token = (await loginResponse.json()).token;
      expect(token, "current browser login token for fixture requests").toBeTruthy();

      await expect(page).toHaveURL(/\/dashboard$/);

      await page.goto(`/assets/${asset.asset_id}/routine-maintenance`);
      await expect(page.getByRole("heading", { name: "Routine maintenance" })).toBeVisible();
      await expect(page.getByText(assetName, { exact: true })).toBeVisible();
      await expect(page.getByText("100 h").first()).toBeVisible();
      await expect(page.getByText("Not configured")).toHaveCount(0);

      await page.getByRole("button", { name: "Update hours" }).click();
      const hoursDialog = page.getByRole("dialog", { name: "Update working hours" });
      await hoursDialog.getByLabel("Working hours").fill("80");
      await hoursDialog.getByLabel("Note").fill("E2E below-threshold reading");
      await hoursDialog.getByRole("button", { name: "Save hours" }).click();

      await expect(page.getByText("Working hours updated")).toBeVisible();
      await expect(page.getByText("80 h").first()).toBeVisible();
      await expect(page.getByText("20 h").first()).toBeVisible();

      await page.getByRole("button", { name: "Update hours" }).click();
      await hoursDialog.getByLabel("Working hours").fill("100");
      await hoursDialog.getByLabel("Note").fill("E2E threshold reading");
      await hoursDialog.getByRole("button", { name: "Save hours" }).click();

      await expect(page.getByText("Routine maintenance required")).toBeVisible();
      await expect(page.getByText("Required", { exact: true }).first()).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Complete maintenance" }).first()
      ).toBeVisible();

      await page.getByRole("button", { name: "Complete maintenance" }).first().click();
      const completeDialog = page.getByRole("dialog", { name: "Complete routine maintenance" });
      await completeDialog.getByLabel("Completion notes").fill("E2E maintenance completed.");
      await completeDialog.getByRole("button", { name: "Complete" }).click();

      await expect(page.getByText("Routine maintenance completed")).toBeVisible();
      await expect(page.getByText("On schedule")).toBeVisible();
      await expect(page.getByText("200 h").first()).toBeVisible();
      await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
    } catch (failure) {
      failed = true; throw failure;
    } finally {
      try {
        if (assetId) await deleteAsset(cleanupRequest, token, assetId);
        if (projectId) {
          const response = await cleanupRequest.delete(`${API_BASE_URL}/project/${projectId}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 });
          expect([200, 404]).toContain(response.status());
        }
      } catch (failure) {
        await test.info().attach("fixture-cleanup-error", { body: String(failure), contentType: "text/plain" });
        if (!failed) throw failure;
      } finally { await cleanupRequest.dispose(); }
    }
  });
});
