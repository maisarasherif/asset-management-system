import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:8080/v1";
const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD;

interface CreatedMainCategory {
  main_category_id: string;
}

interface CreatedCategory {
  category_id: string;
}

interface CreatedTestType {
  test_id: string;
}

interface CreatedAsset {
  asset_id: string;
}

interface CreatedComponent {
  component_id: string;
}

interface CreatedCertificate {
  certificate_id: string;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function postJson<T>(
  request: APIRequestContext,
  token: string,
  path: string,
  data: unknown
) {
  const response = await request.post(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });

  expect(response.ok()).toBeTruthy();
  return (await response.json()) as T;
}

async function deleteIfPresent(request: APIRequestContext, token: string, path: string) {
  const response = await request.delete(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  expect([200, 404]).toContain(response.status());
}

async function selectCertificate(page: Page, certificateName: string) {
  await page.getByLabel("Select certificate").click();

  const optionByRole = page.getByRole("option", {
    name: new RegExp(escapeRegExp(certificateName)),
  });

  if ((await optionByRole.count()) > 0) {
    await optionByRole.first().click();
    return;
  }

  await page.getByText(certificateName).last().click();
}

test.describe("scheduler management flow", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run E2E tests."
  );

  test("admin can inspect scheduler audit tables and clear notification history", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const sortOrderBase = Math.floor(Date.now() / 1000);
    const mainCategoryName = `PW Scheduler Main ${suffix}`;
    const categoryName = `PW Scheduler Category ${suffix}`;
    const testName = `PW Scheduler Test ${suffix}`;
    const assetName = `PW Scheduler Asset ${suffix}`;
    const componentName = `PW Scheduler Component ${suffix}`;
    const certificateName = `PW Scheduler Certificate ${suffix}`;
    const issueDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const expiryDate = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
    const setupRequest = await playwrightRequest.newContext();
    const token = await loginApi(setupRequest);
    let assetId: string | null = null;
    let mainCategoryId: string | null = null;
    let categoryId: string | null = null;
    let testTypeId: string | null = null;

    try {
      const mainCategory = await postJson<CreatedMainCategory>(
        setupRequest,
        token,
        "/main-category",
        {
          main_category_name: mainCategoryName,
          description: "Created by Playwright for scheduler management.",
          sort_order: sortOrderBase,
        }
      );
      mainCategoryId = mainCategory.main_category_id;

      const category = await postJson<CreatedCategory>(setupRequest, token, "/category", {
        main_category_id: mainCategory.main_category_id,
        category_name: categoryName,
        description: "Created by Playwright for scheduler management.",
        sort_order: sortOrderBase + 1,
      });
      categoryId = category.category_id;

      const testType = await postJson<CreatedTestType>(setupRequest, token, "/test-type", {
        test_name: testName,
        validity_duration: 6,
        description: "Created by Playwright for scheduler management.",
      });
      testTypeId = testType.test_id;

      const asset = await postJson<CreatedAsset>(setupRequest, token, "/asset", {
        name: assetName,
        photo: "",
        datasheet: "",
        description: "Created by Playwright for scheduler management.",
        status: "ACTIVE",
        location: "Scheduler Yard",
        assigned_project: "Scheduler Project",
        maintenance_interval_hours: 0,
      });
      assetId = asset.asset_id;

      const component = await postJson<CreatedComponent>(setupRequest, token, "/component", {
        asset_id: asset.asset_id,
        category_id: category.category_id,
        name: componentName,
        serial_number: `PW-SCHED-${suffix}`,
        manufacturer: "Playwright Manufacturer",
        description: "Created by Playwright for scheduler management.",
        location: "Scheduler Yard",
        assigned_project: "Scheduler Project",
        equipment_type: "Scheduler Equipment",
        structure: "Portable",
        model: "PW-SCHED",
        class: "A",
        class_code: "A1",
        safety_critical: "YES",
      });

      await postJson<CreatedCertificate>(setupRequest, token, "/certificate", {
        component_id: component.component_id,
        certificate_name: certificateName,
        issue_date: issueDate,
        expiry_date: expiryDate,
        issuing_authority: "Playwright Authority",
        test_id: testType.test_id,
        imca_ref: "PW-SCHED",
        imca_d018: "PW-SCHED-D018",
        maintenance_notes: "Created by Playwright for scheduler reset verification.",
      });

      await page.goto("/login");
      await page.getByLabel("Email").fill(ADMIN_EMAIL!);
      await page.getByLabel("Password").fill(ADMIN_PASSWORD!);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);

      await page.goto("/scheduler");
      await expect(page.getByRole("heading", { name: "Scheduler management" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Force re-notify" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Notification audit" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Failure audit" })).toBeVisible();

      await selectCertificate(page, certificateName);
      await page.getByRole("button", { name: "Clear notification history" }).click();

      const dialog = page.getByRole("dialog", { name: "Clear notification history" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(certificateName)).toBeVisible();
      await dialog.getByRole("button", { name: "Clear history" }).click();

      await expect(page.getByText("Notification history cleared")).toBeVisible();
    } finally {
      if (assetId) {
        await deleteIfPresent(setupRequest, token, `/asset/${assetId}`);
      }
      if (categoryId) {
        await deleteIfPresent(setupRequest, token, `/category/${categoryId}`);
      }
      if (mainCategoryId) {
        await deleteIfPresent(setupRequest, token, `/main-category/${mainCategoryId}`);
      }
      if (testTypeId) {
        await deleteIfPresent(setupRequest, token, `/test-type/${testTypeId}`);
      }
      await setupRequest.dispose();
    }
  });
});
