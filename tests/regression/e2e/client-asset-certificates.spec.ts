import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:8080/v1";
const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const RUN_CLIENT_PORTAL_TRIGGER =
  process.env.PLAYWRIGHT_RUN_CLIENT_PORTAL_TRIGGER === "1";

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

interface CreatedAsset {
  asset_id: string;
}

interface CreatedComponent {
  component_id: string;
}

interface CreatedCertificate {
  certificate_id: string;
}

async function loginApi(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/login`, {
    data: { email, password },
  });

  expect(response.ok()).toBeTruthy();

  const body = (await response.json()) as { token: string; role: string };
  return body;
}

async function adminToken(request: APIRequestContext) {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD must be set to run E2E tests."
    );
  }

  const session = await loginApi(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  return session.token;
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

async function putJson(
  request: APIRequestContext,
  token: string,
  path: string,
  data: unknown
) {
  const response = await request.put(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });

  expect(response.ok()).toBeTruthy();
}

async function deleteIfPresent(request: APIRequestContext, token: string, path: string) {
  const response = await request.delete(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  expect([200, 404]).toContain(response.status());
}

test.describe("client asset certificates browser flow", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run E2E tests."
  );

  test.skip(
    !RUN_CLIENT_PORTAL_TRIGGER,
    "Set PLAYWRIGHT_RUN_CLIENT_PORTAL_TRIGGER=1 in a test environment to verify the client portal flow."
  );

  test("client can view project asset components and certificates, then loses access when suspended", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const clientPassword = "ClientPortal123!";
    const clientEmail = `client.portal.${suffix}@example.com`;
    const projectName = `PW Client Project ${suffix}`;
    const assetName = `PW Client Asset ${suffix}`;
    const componentName = `PW Client Component ${suffix}`;
    const mainCategoryName = `PW Client Main ${suffix}`;
    const categoryName = `PW Client Category ${suffix}`;
    const certificateName = `PW Client Certificate ${suffix}`;
    const sortOrderBase = Math.floor(Date.now() / 1000);
    const issueDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const expiryDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    const assetPhoto = "https://example.com/client-portal-asset.png";
    const assetDatasheet = "https://example.com/client-portal-datasheet.pdf";

    const setupRequest = await playwrightRequest.newContext();
    const token = await adminToken(setupRequest);
    let clientUser: CreatedUser | null = null;
    let asset: CreatedAsset | null = null;
    let mainCategoryId: string | null = null;
    let categoryId: string | null = null;
    let scopeMainCategoryId: string | null = null;
    let scopeCategoryId: string | null = null;

    try {
      clientUser = await postJson<CreatedUser>(setupRequest, token, "/user", {
        first_name: "Client",
        last_name: "Portal",
        email: clientEmail,
        password: clientPassword,
        role: "CLIENT",
        status: "ACTIVE",
      });

      const project = await postJson<CreatedProject>(setupRequest, token, "/project", {
        project_name: projectName,
        description: "Created by Playwright for the client portal flow.",
        status: "ACTIVE",
      });

      const access = await postJson<CreatedAccess>(
        setupRequest,
        token,
        `/user/${clientUser.user_id}/project-access`,
        {
          project_id: project.project_id,
          status: "ACTIVE",
        }
      );

      const mainCategory = await postJson<CreatedMainCategory>(
        setupRequest,
        token,
        "/main-category",
        {
          main_category_name: mainCategoryName,
          description: "Created by Playwright for the client portal flow.",
          sort_order: sortOrderBase,
        }
      );
      mainCategoryId = mainCategory.main_category_id;

      const category = await postJson<CreatedCategory>(setupRequest, token, "/category", {
        main_category_id: mainCategory.main_category_id,
        category_name: categoryName,
        description: "Created by Playwright for the client portal flow.",
        sort_order: sortOrderBase + 1,
      });
      categoryId = category.category_id;

      const defaultScope = await getJson<CatalogScope>(
        setupRequest,
        token,
        "/catalog-scopes/default"
      );

      const scopeMainCategory = await postJson<CreatedScopeMainCategory>(
        setupRequest,
        token,
        `/catalog-scope/${defaultScope.scope_id}/main-category`,
        {
          main_category_name: mainCategoryName,
          description: "Created by Playwright for the client portal flow.",
          sort_order: sortOrderBase + 2,
        }
      );
      scopeMainCategoryId = scopeMainCategory.scope_main_category_id;

      const scopeCategory = await postJson<CreatedScopeCategory>(
        setupRequest,
        token,
        `/catalog-scope/${defaultScope.scope_id}/category`,
        {
          main_category_id: mainCategory.main_category_id,
          category_name: categoryName,
          description: "Created by Playwright for the client portal flow.",
          sort_order: sortOrderBase + 3,
        }
      );
      expect(scopeCategory.category_id).toBe(category.category_id);
      scopeCategoryId = scopeCategory.scope_category_id;

      const testType = await postJson<CreatedTestType>(setupRequest, token, "/test-type", {
        test_name: certificateName,
        validity_duration: 6,
        description: "Created by Playwright for the client portal flow.",
      });

      asset = await postJson<CreatedAsset>(setupRequest, token, "/asset", {
        name: assetName,
        photo: assetPhoto,
        datasheet: assetDatasheet,
        description: "Created by Playwright for client asset portal verification.",
        status: "ACTIVE",
        location: "Client Portal Yard",
        assigned_project: projectName,
        maintenance_interval_hours: 0,
      });

      const component = await postJson<CreatedComponent>(setupRequest, token, "/component", {
        asset_id: asset.asset_id,
        category_id: category.category_id,
        scope_category_id: scopeCategory.scope_category_id,
        name: componentName,
        serial_number: "PW-CLIENT-001",
        manufacturer: "Playwright Manufacturer",
        description: "Created by Playwright for client certificate selection.",
        location: "Client Portal Yard",
        assigned_project: projectName,
        equipment_type: "Portal Equipment",
        structure: "Portable",
        model: "PW-1",
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
        imca_ref: "PW-IMCA",
        imca_d018: "PW-D018",
        maintenance_notes: "Created by Playwright for client certificate display.",
      });

      await page.goto("/login");
      await page.getByRole("button", { name: "Client" }).click();
      await page.getByLabel("Email").fill(clientEmail);
      await page.getByLabel("Password").fill(clientPassword);
      await page.getByRole("button", { name: "Sign in" }).click();

      await expect(page).toHaveURL(/\/client\/assets$/);
      await expect(page.getByRole("heading", { name: "Client asset portal" })).toBeVisible();
      await expect(page.getByText(assetName, { exact: true })).toBeVisible();
      await expect(page.locator(`img[alt="${assetName} asset"]`)).toBeVisible();
      await expect(page.getByRole("link", { name: "Datasheet" })).toHaveAttribute(
        "href",
        assetDatasheet
      );

      await page.getByRole("button", { name: "Open certificates" }).click();
      await expect(page).toHaveURL(new RegExp(`/client/assets/${asset.asset_id}$`));
      await expect(page.getByText("Select a component to review its certificates.")).toBeVisible();
      await expect(page.getByText(certificateName, { exact: true })).toHaveCount(0);

      await page.locator(".client-component-list__item", { hasText: componentName }).click();

      await expect(page.getByRole("heading", { name: "Certificates" })).toBeVisible();
      const record = page.locator(".client-certificate-record").filter({ hasText: certificateName });
      await expect(record).toBeVisible();
      await expect(record.getByText("Certificate", { exact: true })).toBeVisible();
      await expect(record.getByText(certificateName, { exact: true })).toBeVisible();
      await expect(record.getByText("Validity", { exact: true })).toBeVisible();
      await expect(record.getByText("Valid", { exact: true })).toBeVisible();
      await expect(record.getByText("Test type", { exact: true })).toHaveCount(0);
      await expect(record.getByText("Test period", { exact: true })).toBeVisible();
      await expect(record.getByText("6 months", { exact: true })).toBeVisible();

      const buttonBounds = await page.locator(".client-certificate-scroll").evaluate((scroll) => {
        scroll.scrollLeft = scroll.scrollWidth;
        const recordElement = scroll.querySelector(".client-certificate-record");
        const buttonElement = scroll.querySelector(".client-certificate-record__field--action button");
        if (!recordElement || !buttonElement) {
          return null;
        }

        const recordRect = recordElement.getBoundingClientRect();
        const buttonRect = buttonElement.getBoundingClientRect();
        const scrollRect = scroll.getBoundingClientRect();

        return {
          buttonRight: buttonRect.right,
          recordRight: recordRect.right,
          scrollRight: scrollRect.right,
        };
      });

      expect(buttonBounds).not.toBeNull();
      expect(buttonBounds!.buttonRight).toBeLessThanOrEqual(buttonBounds!.recordRight + 1);
      expect(buttonBounds!.buttonRight).toBeLessThanOrEqual(buttonBounds!.scrollRight + 1);
      await expect(record.getByRole("button", { name: "View file" })).toBeDisabled();

      await putJson(setupRequest, token, `/user-project-access/${access.access_id}`, {
        project_id: project.project_id,
        status: "SUSPENDED",
      });

      await page.goto("/client/assets");
      await expect(page.getByRole("heading", { name: "No assets available" })).toBeVisible();
    } finally {
      if (asset) {
        await deleteIfPresent(setupRequest, token, `/asset/${asset.asset_id}`);
      }
      if (scopeCategoryId) {
        await deleteIfPresent(setupRequest, token, `/catalog-scope-category/${scopeCategoryId}`);
      }
      if (categoryId) {
        await deleteIfPresent(setupRequest, token, `/category/${categoryId}`);
      }
      if (scopeMainCategoryId) {
        await deleteIfPresent(
          setupRequest,
          token,
          `/catalog-scope-main-category/${scopeMainCategoryId}`
        );
      }
      if (mainCategoryId) {
        await deleteIfPresent(setupRequest, token, `/main-category/${mainCategoryId}`);
      }
      if (clientUser) {
        await deleteIfPresent(setupRequest, token, `/user/${clientUser.user_id}`);
      }
      await setupRequest.dispose();
    }
  });
});
