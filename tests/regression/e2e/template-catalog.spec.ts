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

async function getTemplates(request: APIRequestContext, token: string) {
  const response = await request.get(`${API_BASE_URL}/templates`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Array<{ template_id: string; template_name: string }>;
}

async function getPaginated<T>(request: APIRequestContext, token: string, path: string) {
  const response = await request.get(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data: T[] };
  return body.data;
}

async function getTestTypes(request: APIRequestContext, token: string) {
  const response = await request.get(`${API_BASE_URL}/test-types`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Array<{ test_id: string; test_name: string }>;
}

async function getTemplateConfiguration(
  request: APIRequestContext,
  token: string,
  templateId: string
) {
  const response = await request.get(`${API_BASE_URL}/template/${templateId}/configuration`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Array<{
    name: string;
    tests: Array<{ test_id: string; test_name: string }>;
  }>;
}

async function deleteIfPresent(
  request: APIRequestContext,
  token: string,
  path: string
) {
  const response = await request.delete(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  expect([200, 404]).toContain(response.status());
}

async function cleanupByName(
  request: APIRequestContext,
  token: string,
  names: {
    templateName: string;
    testName: string;
    categoryName: string;
    mainCategoryName: string;
  }
) {
  const templates = await getTemplates(request, token);
  const template = templates.find((item) => item.template_name === names.templateName);
  if (template) {
    await deleteIfPresent(request, token, `/template/${template.template_id}`);
  }

  const testTypes = await getTestTypes(request, token);
  const testType = testTypes.find((item) => item.test_name === names.testName);
  if (testType) {
    await deleteIfPresent(request, token, `/test-type/${testType.test_id}`);
  }

  const scopesResponse = await request.get(`${API_BASE_URL}/catalog-scopes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (scopesResponse.ok()) {
    const scopes = (await scopesResponse.json()) as Array<{ scope_id: string }>;
    for (const scope of scopes) {
      const scopeCategories = await getPaginated<{
        scope_category_id: string;
        category_name: string;
      }>(request, token, `/catalog-scope/${scope.scope_id}/categories?page=1&limit=200`);
      const scopeCategory = scopeCategories.find(
        (item) => item.category_name === names.categoryName
      );
      if (scopeCategory) {
        await deleteIfPresent(
          request,
          token,
          `/catalog-scope-category/${scopeCategory.scope_category_id}`
        );
      }

      const scopeMainCategories = await getPaginated<{
        scope_main_category_id: string;
        main_category_name: string;
      }>(request, token, `/catalog-scope/${scope.scope_id}/main-categories?page=1&limit=200`);
      const scopeMainCategory = scopeMainCategories.find(
        (item) => item.main_category_name === names.mainCategoryName
      );
      if (scopeMainCategory) {
        await deleteIfPresent(
          request,
          token,
          `/catalog-scope-main-category/${scopeMainCategory.scope_main_category_id}`
        );
      }
    }
  }

  const categories = await getPaginated<{ category_id: string; category_name: string }>(
    request,
    token,
    "/categories?page=1&limit=200"
  );
  const category = categories.find((item) => item.category_name === names.categoryName);
  if (category) {
    await deleteIfPresent(request, token, `/category/${category.category_id}`);
  }

  const mainCategories = await getPaginated<
    { main_category_id: string; main_category_name: string }
  >(request, token, "/main-categories?page=1&limit=200");
  const mainCategory = mainCategories.find(
    (item) => item.main_category_name === names.mainCategoryName
  );
  if (mainCategory) {
    await deleteIfPresent(request, token, `/main-category/${mainCategory.main_category_id}`);
  }
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

test.describe("template and catalog browser flow", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run E2E tests."
  );

  test("admin can create catalog entries and configure a template", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const names = {
      mainCategoryName: `PW Main ${suffix}`,
      categoryName: `PW Category ${suffix}`,
      testName: `PW Test ${suffix}`,
      templateName: `PW Template ${suffix}`,
    };
    const componentName = `PW Component ${suffix}`;
    const cleanupRequest = await playwrightRequest.newContext();
    const token = await loginApi(cleanupRequest);

    try {
      await page.goto("/login");

      await page.getByLabel("Email").fill(ADMIN_EMAIL!);
      await page.getByLabel("Password").fill(ADMIN_PASSWORD!);
      await page.getByRole("button", { name: "Sign in" }).click();

      await expect(page).toHaveURL(/\/dashboard$/);

      await page.getByRole("link", { name: "Catalog" }).click();
      await expect(page).toHaveURL(/\/catalog$/);

      await page.getByRole("button", { name: "Create main category" }).click();
      const mainCategoryDialog = page.getByRole("dialog");
      await mainCategoryDialog.getByLabel("Main category name").fill(names.mainCategoryName);
      await mainCategoryDialog
        .getByLabel("Description")
        .fill("Created by Playwright to verify the catalog flow.");
      await mainCategoryDialog
        .getByRole("button", { name: "Create main category" })
        .click();

      await expect(page.getByText("Main category created")).toBeVisible();
      await expect(page.getByText(names.mainCategoryName)).toBeVisible();

      await page.getByRole("button", { name: "Create category" }).click();
      const categoryDialog = page.getByRole("dialog");
      await selectCloudscapeOption(page, "catalog-category-main-category", names.mainCategoryName);
      await categoryDialog.getByLabel("Category name").fill(names.categoryName);
      await categoryDialog
        .getByLabel("Description")
        .fill("Created by Playwright to verify the category flow.");
      await categoryDialog.getByRole("button", { name: "Create category" }).click();

      await expect(page.getByText("Category created")).toBeVisible();
      await expect(page.getByText(names.categoryName)).toBeVisible();

      await page.getByRole("button", { name: "Create test type" }).click();
      const testDialog = page.getByRole("dialog");
      await testDialog.getByLabel("Test type name").fill(names.testName);
      await testDialog.getByLabel("Validity duration (months)").fill("12");
      await testDialog
        .getByLabel("Description")
        .fill("Created by Playwright to verify the test type flow.");
      await testDialog.getByRole("button", { name: "Create test type" }).click();

      await expect(page.getByText("Test type created")).toBeVisible();
      await expect(page.getByText(names.testName)).toBeVisible();

      await page.getByRole("link", { name: "Templates" }).click();
      await expect(page).toHaveURL(/\/templates$/);

      await page.getByRole("button", { name: "Create template" }).click();
      await expect(page).toHaveURL(/\/templates\/new$/);

      await page.getByLabel("Template name").fill(names.templateName);
      await page
        .getByLabel("Description")
        .fill("Created by Playwright to verify the template flow.");
      await page.getByRole("button", { name: "Create template" }).click();

      await expect(page).toHaveURL(/\/templates\/.+\/configure$/);
      await expect(
        page.getByRole("heading", { name: new RegExp(`Configure ${escapeRegExp(names.templateName)}`) })
      ).toBeVisible();

      await page.getByRole("button", { name: "Add component" }).click();

      const componentDialog = page.getByRole("dialog", { name: "Add template component" });
      await expect(componentDialog).toBeVisible();
      await componentDialog.getByLabel("Component name").fill(componentName);
      await componentDialog
        .locator("textarea")
        .first()
        .fill("Configured by Playwright to verify component setup.");
      await selectCloudscapeOption(
        page,
        "template-component-category",
        `${names.mainCategoryName} > ${names.categoryName}`
      );
      await selectCloudscapeMultiOption(page, "template-component-tests", names.testName);
      await componentDialog.getByRole("button", { name: "Save component" }).click();

      await expect(page.getByText(componentName, { exact: true }).first()).toBeVisible();
      const templateId = page.url().match(/\/templates\/([^/]+)\/configure$/)?.[1];
      expect(templateId).toBeTruthy();
      const configuration = await getTemplateConfiguration(cleanupRequest, token, templateId!);
      const savedComponent = configuration.find((component) => component.name === componentName);
      expect(savedComponent).toBeTruthy();
      expect(Array.isArray(savedComponent!.tests)).toBe(true);
      expect(savedComponent!.tests.map((assignedTest) => assignedTest.test_name)).toContain(
        names.testName
      );
      await page.getByRole("button", { name: "Back to template" }).click();
      await expect(page).toHaveURL(/\/templates\/[^/]+$/);
      await expect(
        page.getByRole("heading", { name: new RegExp(`^${escapeRegExp(names.templateName)}$`) })
      ).toBeVisible();
      await expect(page.getByText(componentName, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(names.testName, { exact: true }).first()).toBeVisible();
    } finally {
      await cleanupByName(cleanupRequest, token, names);
      await cleanupRequest.dispose();
    }
  });
});
