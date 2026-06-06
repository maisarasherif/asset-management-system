import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:8080/v1";
const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD;

interface CreatedUser {
  user_id: string;
  email: string;
}

interface CreatedProject {
  project_id: string;
}

interface CreatedAccess {
  access_id: string;
}

interface CreatedMainCategory {
  main_category_id: string;
}

interface CreatedCategory {
  category_id: string;
}

interface CatalogScope {
  scope_id: string;
}

interface CreatedScopeMainCategory {
  scope_main_category_id: string;
}

interface CreatedScopeCategory {
  scope_category_id: string;
  category_id: string;
}

interface CreatedTestType {
  test_id: string;
}

interface CreatedTemplate {
  template_id: string;
}

interface CreatedAsset {
  asset_id: string;
}

interface ComponentRecord {
  component_id: string;
}

interface CertificateRecord {
  certificate_id: string;
  certificate_name: string;
}

interface PaginatedResponse<T> {
  data: T[];
}

interface RegressionFixture {
  suffix: string;
  clientEmail: string;
  clientPassword: string;
  clientUserId: string;
  projectName: string;
  assetId: string;
  assetName: string;
  componentId: string;
  componentName: string;
  certificateId: string;
  certificateName: string;
  templateId: string;
  templateName: string;
  categoryId: string;
  categoryName: string;
  mainCategoryId: string;
  mainCategoryName: string;
  scopeMainCategoryId: string;
  scopeCategoryId: string;
  testId: string;
  testName: string;
  accessId: string;
}

async function loginApi(request: APIRequestContext) {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD must be set to run E2E tests.",
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
  data: unknown,
) {
  const response = await request.post(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });

  expect(response.ok()).toBeTruthy();
  return (await response.json()) as T;
}

async function putJson(
  request: APIRequestContext,
  token: string,
  path: string,
  data: unknown,
) {
  const response = await request.put(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });

  expect(response.ok()).toBeTruthy();
}

async function getJson<T>(
  request: APIRequestContext,
  token: string,
  path: string,
) {
  const response = await request.get(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  expect(response.ok()).toBeTruthy();
  return (await response.json()) as T;
}

async function deleteIfPresent(
  request: APIRequestContext,
  token: string,
  path: string,
) {
  const response = await request.delete(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  expect([200, 404]).toContain(response.status());
}

async function createRegressionFixture(
  request: APIRequestContext,
): Promise<RegressionFixture> {
  const token = await loginApi(request);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const clientPassword = "WholeAppClient123!";
  const clientEmail = `whole.app.client.${suffix}@example.com`;
  const projectName = `PW Whole Project ${suffix}`;
  const mainCategoryName = `PW Whole Main ${suffix}`;
  const categoryName = `PW Whole Category ${suffix}`;
  const testName = `PW Whole Certificate ${suffix}`;
  const templateName = `PW Whole Template ${suffix}`;
  const componentName = `PW Whole Component ${suffix}`;
  const assetName = `PW Whole Asset ${suffix}`;
  const sortOrderBase = Math.floor(Date.now() / 1000);

  const clientUser = await postJson<CreatedUser>(request, token, "/user", {
    first_name: "Whole",
    last_name: "Client",
    email: clientEmail,
    password: clientPassword,
    role: "CLIENT",
    status: "ACTIVE",
  });

  const project = await postJson<CreatedProject>(request, token, "/project", {
    project_name: projectName,
    description: "Created by Playwright for whole-app route regression.",
    status: "ACTIVE",
  });

  const access = await postJson<CreatedAccess>(
    request,
    token,
    `/user/${clientUser.user_id}/project-access`,
    {
      project_id: project.project_id,
      status: "ACTIVE",
    },
  );

  const mainCategory = await postJson<CreatedMainCategory>(
    request,
    token,
    "/main-category",
    {
      main_category_name: mainCategoryName,
      description: "Created by Playwright for whole-app route regression.",
      sort_order: sortOrderBase,
    },
  );

  const category = await postJson<CreatedCategory>(
    request,
    token,
    "/category",
    {
      main_category_id: mainCategory.main_category_id,
      category_name: categoryName,
      description: "Created by Playwright for whole-app route regression.",
      sort_order: sortOrderBase + 1,
    },
  );

  const defaultScope = await getJson<CatalogScope>(
    request,
    token,
    "/catalog-scopes/default",
  );

  const scopeMainCategory = await postJson<CreatedScopeMainCategory>(
    request,
    token,
    `/catalog-scope/${defaultScope.scope_id}/main-category`,
    {
      main_category_name: mainCategoryName,
      description: "Created by Playwright for whole-app route regression.",
      sort_order: sortOrderBase + 2,
    },
  );

  const scopeCategory = await postJson<CreatedScopeCategory>(
    request,
    token,
    `/catalog-scope/${defaultScope.scope_id}/category`,
    {
      main_category_id: mainCategory.main_category_id,
      category_name: categoryName,
      description: "Created by Playwright for whole-app route regression.",
      sort_order: sortOrderBase + 3,
    },
  );
  expect(scopeCategory.category_id).toBe(category.category_id);

  const testType = await postJson<CreatedTestType>(
    request,
    token,
    "/test-type",
    {
      test_name: testName,
      validity_duration: 12,
      description: "Created by Playwright for whole-app route regression.",
    },
  );

  const template = await postJson<CreatedTemplate>(
    request,
    token,
    "/template",
    {
      template_name: templateName,
      description: "Created by Playwright for whole-app route regression.",
    },
  );

  await putJson(
    request,
    token,
    `/template/${template.template_id}/configuration`,
    {
      components: [
        {
          category_id: category.category_id,
          scope_category_id: scopeCategory.scope_category_id,
          name: componentName,
          description: "Generated by whole-app route regression.",
          serial_number: `PW-WHOLE-${suffix}`,
          manufacturer: "Playwright",
          location: "Whole App Yard",
          assigned_project: projectName,
          equipment_type: "Route Harness",
          structure: "Portable",
          model: "PW-1",
          class: "A",
          class_code: "A1",
          safety_critical: "YES",
          test_ids: [testType.test_id],
        },
      ],
    },
  );

  const asset = await postJson<CreatedAsset>(request, token, "/asset", {
    name: assetName,
    photo: "https://example.com/whole-app-asset.png",
    datasheet: "https://example.com/whole-app-datasheet.pdf",
    description: "Created by Playwright to verify all Cloudscape routes.",
    status: "ACTIVE",
    asset_kind: "COMPONENTIZED",
    location: "Whole App Yard",
    assigned_project: projectName,
    maintenance_interval_hours: 100,
    template_id: template.template_id,
  });

  const components = await getJson<PaginatedResponse<ComponentRecord>>(
    request,
    token,
    `/components/asset/${asset.asset_id}?page=1&limit=20`,
  );
  expect(components.data).toHaveLength(1);
  const componentId = components.data[0].component_id;

  const certificates = await getJson<PaginatedResponse<CertificateRecord>>(
    request,
    token,
    `/certificates/component/${componentId}?page=1&limit=20`,
  );
  expect(certificates.data).toHaveLength(1);
  const certificate = certificates.data[0];

  return {
    suffix,
    clientEmail,
    clientPassword,
    clientUserId: clientUser.user_id,
    projectName,
    assetId: asset.asset_id,
    assetName,
    componentId,
    componentName,
    certificateId: certificate.certificate_id,
    certificateName: certificate.certificate_name,
    templateId: template.template_id,
    templateName,
    categoryId: category.category_id,
    categoryName,
    mainCategoryId: mainCategory.main_category_id,
    mainCategoryName,
    scopeMainCategoryId: scopeMainCategory.scope_main_category_id,
    scopeCategoryId: scopeCategory.scope_category_id,
    testId: testType.test_id,
    testName,
    accessId: access.access_id,
  };
}

async function cleanupRegressionFixture(
  request: APIRequestContext,
  fixture: RegressionFixture | null,
) {
  if (!fixture) {
    return;
  }

  const token = await loginApi(request);

  await deleteIfPresent(request, token, `/asset/${fixture.assetId}`);
  await deleteIfPresent(request, token, `/template/${fixture.templateId}`);
  await deleteIfPresent(
    request,
    token,
    `/catalog-scope-category/${fixture.scopeCategoryId}`,
  );
  await deleteIfPresent(request, token, `/category/${fixture.categoryId}`);
  await deleteIfPresent(
    request,
    token,
    `/catalog-scope-main-category/${fixture.scopeMainCategoryId}`,
  );
  await deleteIfPresent(
    request,
    token,
    `/main-category/${fixture.mainCategoryId}`,
  );
  await deleteIfPresent(request, token, `/test-type/${fixture.testId}`);
  await deleteIfPresent(
    request,
    token,
    `/user-project-access/${fixture.accessId}`,
  );
  await deleteIfPresent(request, token, `/user/${fixture.clientUserId}`);
}

async function loginStaff(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function loginClient(page: Page, fixture: RegressionFixture) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Client" }).click();
  await page.getByLabel("Email").fill(fixture.clientEmail);
  await page.getByLabel("Password").fill(fixture.clientPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/client\/assets$/);
}

async function expectHealthyPage(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator(".route-error-page")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Page error" })).toHaveCount(
    0,
  );
}

async function expectVisibleText(page: Page, text: string | RegExp) {
  const matches = page.getByText(text);
  await expect(matches.first()).toBeAttached();
  await expect
    .poll(async () => {
      const count = await matches.count();
      for (let index = 0; index < count; index += 1) {
        if (await matches.nth(index).isVisible()) {
          return true;
        }
      }
      return false;
    })
    .toBe(true);
}

async function expectRoute(
  page: Page,
  path: string,
  visibleTexts: Array<string | RegExp>,
) {
  await expectHealthyPage(page, path);
  for (const visibleText of visibleTexts) {
    await expectVisibleText(page, visibleText);
  }
}

async function expectOversizeCertificateUploadGuard(
  page: Page,
  options: { expectFileNameCleared?: boolean } = {},
) {
  const fileName = "oversized-certificate.pdf";
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 65),
  });

  await expectVisibleText(page, "Certificate file must be 10 MB or smaller.");
  if (options.expectFileNameCleared) {
    await expect(page.getByText(fileName)).toHaveCount(0);
  }
}

test.describe("whole app regression", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run E2E tests.",
  );

  test("admin can open every major routed screen against current app data", async ({
    page,
  }) => {
    const setupRequest = await playwrightRequest.newContext();
    let fixture: RegressionFixture | null = null;

    try {
      fixture = await createRegressionFixture(setupRequest);
      await loginStaff(page);

      await expectRoute(page, `/assets/${fixture.assetId}`, [
        fixture.assetName,
        "Components",
        "Certificates",
      ]);

      await expectRoute(page, "/dashboard", [
        fixture.assetName,
        "Certificate status",
      ]);
      await expectRoute(page, "/assets", [
        "Assets directory",
        fixture.assetName,
      ]);
      await expectRoute(page, "/assets/new", [
        "Create asset",
        "Asset information",
      ]);
      await expectRoute(page, `/assets/${fixture.assetId}/edit`, [
        "Edit asset",
        "Asset information",
      ]);
      await expectRoute(
        page,
        `/assets/${fixture.assetId}/routine-maintenance`,
        ["Routine maintenance", fixture.assetName],
      );
      await expectRoute(page, `/assets/${fixture.assetId}/components/new`, [
        "Create component",
        "Component information",
      ]);
      await expectRoute(
        page,
        `/assets/${fixture.assetId}/components/${fixture.componentId}/edit`,
        ["Edit component", "Component information"],
      );
      await expectRoute(
        page,
        `/assets/${fixture.assetId}/components/${fixture.componentId}/certificates/new`,
        ["Create certificate", "Certificate information"],
      );
      await expectOversizeCertificateUploadGuard(page);
      await expectRoute(
        page,
        `/assets/${fixture.assetId}/components/${fixture.componentId}/certificates/${fixture.certificateId}`,
        [fixture.certificateName, "Certificate summary"],
      );
      await expectOversizeCertificateUploadGuard(page, {
        expectFileNameCleared: true,
      });
      await expectRoute(
        page,
        `/assets/${fixture.assetId}/components/${fixture.componentId}/certificates/${fixture.certificateId}/edit`,
        ["Edit certificate", "Certificate information"],
      );

      await expectRoute(page, "/templates", [
        "Templates",
        fixture.templateName,
      ]);
      await expectRoute(page, "/templates/new", [
        "Create template",
        "Template details",
      ]);
      await expectRoute(page, `/templates/${fixture.templateId}`, [
        fixture.templateName,
        "Configuration status",
      ]);
      await expectRoute(page, `/templates/${fixture.templateId}/configure`, [
        new RegExp(`Configure ${fixture.templateName}`),
        "Template components",
      ]);

      await expectRoute(page, "/catalog", [
        "Catalog",
        fixture.mainCategoryName,
        fixture.categoryName,
        fixture.testName,
      ]);
      await expectRoute(page, "/administration", ["Administration", "Users"]);
      await expectRoute(page, "/client-access", [
        "Client access",
        fixture.projectName,
      ]);
      await expectRoute(page, "/scheduler", [
        "Scheduler management",
        "Notification audit",
      ]);
      await expectRoute(page, "/account", ["Account", ADMIN_EMAIL!]);
    } finally {
      await cleanupRegressionFixture(setupRequest, fixture);
      await setupRequest.dispose();
    }
  });

  test("client role is confined to the client portal and account routes", async ({
    page,
  }) => {
    const setupRequest = await playwrightRequest.newContext();
    let fixture: RegressionFixture | null = null;

    try {
      fixture = await createRegressionFixture(setupRequest);
      await loginClient(page, fixture);

      await expectRoute(page, "/client/assets", [
        "Client asset portal",
        fixture.assetName,
      ]);
      await expectRoute(page, `/client/assets/${fixture.assetId}`, [
        fixture.assetName,
        "Components",
        "Certificates",
      ]);
      await expectRoute(page, "/account", ["Account", fixture.clientEmail]);

      await page.goto("/templates");
      await expect(page).toHaveURL(/\/client\/assets$/);
      await expect(
        page.getByText(fixture.assetName, { exact: true }).first(),
      ).toBeVisible();
    } finally {
      await cleanupRegressionFixture(setupRequest, fixture);
      await setupRequest.dispose();
    }
  });
});
