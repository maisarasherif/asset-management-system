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

interface CreatedEquipmentType {
  equipment_type_id: string;
}

interface CreatedTestType {
  test_id: string;
}

interface PaginatedResponse<T> {
  data: T[];
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

async function getJson<T>(request: APIRequestContext, token: string, path: string) {
  const response = await request.get(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
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

async function selectCloudscapeOption(page: Page, testId: string, optionText: string) {
  const container = page.getByTestId(testId);
  await expect(container).toBeVisible();

  const trigger = container.locator("button,[role='combobox'],input").first();
  await trigger.click();

  const optionByRole = page.getByRole("option", {
    name: new RegExp(`^${escapeRegExp(optionText)}$`),
  });

  if ((await optionByRole.count()) > 0) {
    await optionByRole.first().click();
    return;
  }

  await page.getByText(optionText, { exact: true }).last().click();
}

async function selectCloudscapeMultiOption(page: Page, testId: string, optionText: string) {
  await selectCloudscapeOption(page, testId, optionText);
  await page.keyboard.press("Escape");
}

test.describe("single-asset equipment flow", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run E2E tests."
  );

  test("admin can create a single-equipment asset and review asset certificates", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const equipmentTypeName = `PW Equipment Type ${suffix}`;
    const visualTestName = `PW Single Visual ${suffix}`;
    const loadTestName = `PW Single Load ${suffix}`;
    const assetName = `PW Single Equipment Asset ${suffix}`;
    const setupRequest = await playwrightRequest.newContext();
    const token = await loginApi(setupRequest);
    let assetId: string | null = null;
    let equipmentType: CreatedEquipmentType | null = null;
    let visualTest: CreatedTestType | null = null;
    let loadTest: CreatedTestType | null = null;

    try {
      equipmentType = await postJson<CreatedEquipmentType>(
        setupRequest,
        token,
        "/equipment-type",
        {
          equipment_type_name: equipmentTypeName,
          sort_order: Math.floor(Date.now() / 1000),
          description: "Created by Playwright for single-asset equipment.",
        }
      );

      visualTest = await postJson<CreatedTestType>(setupRequest, token, "/test-type", {
        test_name: visualTestName,
        validity_duration: 12,
        description: "Created by Playwright for single-asset equipment.",
      });

      loadTest = await postJson<CreatedTestType>(setupRequest, token, "/test-type", {
        test_name: loadTestName,
        validity_duration: 6,
        description: "Created by Playwright for single-asset equipment.",
      });

      await page.goto("/login");
      await page.getByLabel("Email").fill(ADMIN_EMAIL!);
      await page.getByLabel("Password").fill(ADMIN_PASSWORD!);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);

      await page.goto("/assets/new");
      await page.getByLabel("Asset name").fill(assetName);
      await page.getByLabel("Assigned project").fill("PW Single Equipment Project");
      await page.getByLabel("Location").fill("PW Single Yard");
      await page
        .getByLabel("Description")
        .fill("Created by Playwright to verify single-asset equipment creation.");

      await selectCloudscapeOption(page, "asset-kind-select", "Single-asset equipment");
      await selectCloudscapeOption(page, "single-equipment-type-select", equipmentTypeName);
      await selectCloudscapeMultiOption(page, "single-equipment-test-types", visualTestName);
      await selectCloudscapeMultiOption(page, "single-equipment-test-types", loadTestName);

      await expect(page.getByText("Certificate slots")).toBeVisible();
      await expect(page.getByText("2", { exact: true }).first()).toBeVisible();

      await page.getByRole("button", { name: "Create asset" }).click();
      await expect(page).toHaveURL(/\/assets\/[0-9a-f-]+$/);
      assetId = page.url().match(/\/assets\/([^/?#]+)$/)?.[1] || null;
      expect(assetId).toBeTruthy();

      await expect(page.getByRole("heading", { name: assetName })).toBeVisible();
      await expect(page.getByText(equipmentTypeName, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Asset certificates" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Components" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Add component" })).toHaveCount(0);
      await expect(page.getByText(visualTestName, { exact: true })).toBeVisible();
      await expect(page.getByText(loadTestName, { exact: true })).toBeVisible();
      await expect(page.getByText("Pending", { exact: true }).first()).toBeVisible();

      const equipment = await getJson<{
        equipment_type_id: string;
        self_component_id: string;
      }>(setupRequest, token, `/asset/${assetId}/single-equipment`);
      expect(equipment.equipment_type_id).toBe(equipmentType.equipment_type_id);

      const components = await getJson<PaginatedResponse<{
        component_id: string;
        component_kind: string;
        category_id: string | null;
      }>>(setupRequest, token, `/components/asset/${assetId}?page=1&limit=20`);
      expect(components.data).toHaveLength(1);
      expect(components.data[0].component_id).toBe(equipment.self_component_id);
      expect(components.data[0].component_kind).toBe("SELF");
      expect(components.data[0].category_id).toBeNull();

      const certificates = await getJson<PaginatedResponse<{
        certificate_name: string;
        status: string;
      }>>(
        setupRequest,
        token,
        `/certificates/component/${equipment.self_component_id}?page=1&limit=20`
      );
      expect(certificates.data.map((certificate) => certificate.certificate_name).sort()).toEqual(
        [loadTestName, visualTestName].sort()
      );
      expect(certificates.data.every((certificate) => certificate.status === "PENDING")).toBe(true);

      const forbiddenComponent = await setupRequest.post(`${API_BASE_URL}/component`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          asset_id: assetId,
          category_id: "00000000-0000-4000-8000-000000000000",
          name: "Forbidden component",
          serial_number: "",
          manufacturer: "",
          description: "",
          location: "",
          assigned_project: "",
          equipment_type: "",
          structure: "",
          model: "",
          class: "",
          class_code: "",
          safety_critical: "NO",
        },
      });
      expect(forbiddenComponent.status()).toBe(409);
    } finally {
      if (assetId) {
        await deleteIfPresent(setupRequest, token, `/asset/${assetId}`);
      }
      if (equipmentType) {
        await deleteIfPresent(setupRequest, token, `/equipment-type/${equipmentType.equipment_type_id}`);
      }
      if (visualTest) {
        await deleteIfPresent(setupRequest, token, `/test-type/${visualTest.test_id}`);
      }
      if (loadTest) {
        await deleteIfPresent(setupRequest, token, `/test-type/${loadTest.test_id}`);
      }
      await setupRequest.dispose();
    }
  });
});
