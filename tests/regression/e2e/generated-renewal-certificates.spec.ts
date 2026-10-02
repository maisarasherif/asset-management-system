import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type APIRequestContext } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:18082/v1";
const pdf = readFileSync(fileURLToPath(new URL("../fixtures/sample-certificate.pdf", import.meta.url)));

// Exercise today's real workflow before extending it with generated issuance.
// Prerequisites belong to this spec, independent of whole-app fixtures.
test("certificate renewal baseline uploads through UI and reads the historical R2 document", async ({ page, request }) => {
  const email = process.env.PLAYWRIGHT_ADMIN_EMAIL;
  const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
  const prefix = process.env.AMS_TEST_STORAGE_PREFIX;
  expect(email, "runner admin email").toBeTruthy();
  expect(password, "runner admin password").toBeTruthy();
  expect(prefix, "runner storage scope").toBeTruthy();
  const login = await request.post(`${api}/login`, { data: { email, password } });
  expect(login.status()).toBe(200);
  const token: string = (await login.json()).token;
  const headers = { Authorization: `Bearer ${token}` };
  const suffix = `renewal-${Date.now()}`;
  const cleanup: string[] = [];
  const post = async (path: string, data: unknown, idField: string) => {
    const response = await request.post(`${api}${path}`, { headers, data });
    expect(response.status(), await response.text()).toBe(201);
    const body = await response.json();
    expect(body[idField]).toBeTruthy();
    return body;
  };
  try {
    const main = await post("/main-category", { main_category_name: suffix, description: "Renewal baseline", sort_order: 100 }, "main_category_id");
    cleanup.push(`/main-category/${main.main_category_id}`);
    const category = await post("/category", { main_category_id: main.main_category_id, category_name: suffix, description: "Renewal baseline", sort_order: 100 }, "category_id");
    cleanup.push(`/category/${category.category_id}`);
    const scopeResponse = await request.get(`${api}/catalog-scopes/default`, { headers });
    expect(scopeResponse.status()).toBe(200);
    const scope = await scopeResponse.json();
    const scopedMain = await post(`/catalog-scope/${scope.scope_id}/main-category`, { main_category_name: suffix, description: "Renewal baseline", sort_order: 100 }, "scope_main_category_id");
    cleanup.push(`/catalog-scope-main-category/${scopedMain.scope_main_category_id}`);
    const scopedCategory = await post(`/catalog-scope/${scope.scope_id}/category`, { main_category_id: main.main_category_id, category_name: suffix, description: "Renewal baseline", sort_order: 100 }, "scope_category_id");
    cleanup.push(`/catalog-scope-category/${scopedCategory.scope_category_id}`);
    const type = await post("/test-type", { test_name: suffix, validity_duration: 12, description: "Renewal baseline" }, "test_id");
    cleanup.push(`/test-type/${type.test_id}`);
    const signerCategory = await post("/competency-category", { category_code: suffix, category_name: suffix, description: "Renewal baseline", active: true }, "competency_category_id");
    // These profiles have no delete API; the disposable database owns cleanup.
    const signer = await post("/competent-person", { full_name: suffix, person_type: "Internal", organization: "Porto Marine", competency_category_id: signerCategory.competency_category_id, active: true }, "competent_person_id");
    const asset = await post("/asset", { name: suffix, description: "Renewal baseline", photo: "", datasheet: "", status: "ACTIVE", asset_kind: "COMPONENTIZED", location: "Warehouse", assigned_project: "" }, "asset_id");
    cleanup.push(`/asset/${asset.asset_id}`);
    const component = await post("/component", { asset_id: asset.asset_id, category_id: category.category_id, scope_category_id: scopedCategory.scope_category_id, name: suffix, serial_number: suffix, manufacturer: "PMS", model: "Baseline", location: "Warehouse", assigned_project: "", equipment_type: "Equipment", structure: "Fixed", class: "A", class_code: "A1", safety_critical: "YES", description: "Renewal baseline" }, "component_id");
    cleanup.push(`/component/${component.component_id}`);
    const certificate = await post("/certificate", { component_id: component.component_id, certificate_name: suffix, test_id: type.test_id, issue_date: "2026-01-02T00:00:00Z", expiry_date: "2027-01-02T00:00:00Z", certificate_file: "", issuing_authority: "PMS", imca_ref: "D018", imca_d018: "Baseline", maintenance_notes: "", competency_category_ids: [signerCategory.competency_category_id] }, "certificate_id");
    const certificatePath = `/certificate/${certificate.certificate_id}`;
    cleanup.push(certificatePath);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    // UI login replaces the account's persisted access token. Use the browser's
    // cookie-authenticated context for all following API assertions and cleanup.
    const browserRequest: APIRequestContext = page.request;
    await page.goto(`/assets/${asset.asset_id}/components/${component.component_id}/certificates/${certificate.certificate_id}`);
    await page.getByLabel("Certificate renewal issue date").fill("2026-10-02");
    await expect(page.getByLabel("Certificate renewal expiry date")).toHaveValue("2027-10-02");
    await page.getByLabel("Certificate renewal file").setInputFiles({ name: "baseline-renewal.pdf", mimeType: "application/pdf", buffer: pdf });
    await page.getByText("Select competent person", { exact: true }).click();
    await page.getByRole("option", { name: new RegExp(signer.full_name) }).click();
    await page.getByRole("button", { name: "Renew/change certificate", exact: true }).click();
    await expect(page.getByText("Certificate renewed", { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "baseline-renewal.pdf", exact: true })).toBeVisible();
    const currentResponse = await browserRequest.get(`${api}${certificatePath}`);
    expect(currentResponse.status()).toBe(200);
    const current = await currentResponse.json();
    expect(current.issue_date).toBe("2026-10-02T00:00:00Z");
    expect(current.expiry_date).toBe("2027-10-02T00:00:00Z");
    expect(current.certificate_file.startsWith(prefix)).toBe(true);
    const historyResponse = await browserRequest.get(`${api}${certificatePath}/uploads?page=1&limit=20`);
    expect(historyResponse.status()).toBe(200);
    const history = await historyResponse.json();
    expect(history.data).toHaveLength(1);
    expect(history.data[0].competent_person_id).toBe(signer.competent_person_id);
    const linkResponse = await browserRequest.get(`${api}${certificatePath}/uploads/${history.data[0].uuid}/file`);
    expect(linkResponse.status()).toBe(200);
    const document = await request.get((await linkResponse.json()).url);
    expect(document.status()).toBe(200);
    expect(await document.body()).toEqual(pdf);
    await page.reload();
    await expect(page.getByRole("cell", { name: "baseline-renewal.pdf", exact: true })).toBeVisible();
  } finally {
    // Ordered API cleanup supplements the runner's DB/R2 cleanup on failures.
    // The componentized asset cascades component/certificate rows as well.
    for (const path of cleanup.reverse()) {
      const response = await page.request.delete(`${api}${path}`);
      // Before browser login, fall back to the initial API token.
      const status = response.status() === 401 ? (await request.delete(`${api}${path}`, { headers })).status() : response.status();
      expect([200, 404], `cleanup ${path}`).toContain(status);
    }
  }
});
