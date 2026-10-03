import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:18082/v1";
const pdf = readFileSync(resolve(__dirname, "../fixtures/sample-certificate.pdf"));
const signaturePNG = readFileSync(resolve(__dirname, "../fixtures/signature-sample.png"));
const signatureJPEG = readFileSync(resolve(__dirname, "../fixtures/signature-replacement.jpg"));

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

test("SUPER_ADMIN manages competent signatures and admin categories; generated signer selection enforces eligibility", async ({ page, request }) => {
  const rootEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL;
  const rootPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
  expect(rootEmail).toBeTruthy();
  expect(rootPassword).toBeTruthy();
  expect(process.env.AMS_TEST_STORAGE_PREFIX).toBeTruthy();
  const suffix = `managed-signers-${Date.now()}`;
  const adminEmail = `${suffix}@example.com`;
  const adminPassword = "Managed-signing-test-123!";
  const cleanup: string[] = [];
  let cleanupHeaders: { Authorization: string } | undefined;
  const loginUI = async (email: string, password: string) => {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  };
  const post = async (path: string, data: unknown, idField: string) => {
    const response = await page.request.post(`${api}${path}`, { data });
    expect(response.status(), await response.text()).toBe(201);
    const body = await response.json();
    expect(body[idField]).toBeTruthy();
    return body;
  };
  const select = async (label: string, option: string) => {
    await page.getByLabel(label, { exact: true }).click();
    await page.getByRole("option", { name: new RegExp(`^${option}`) }).click();
  };
  const narrow = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    const close = page.getByRole("button", { name: "Close primary navigation", exact: true });
    if (width < 1101 && await close.isVisible()) await close.click();
  };
  try {
    await loginUI(rootEmail!, rootPassword!);
    const main = await post("/main-category", { main_category_name: suffix, description: "Signer selection", sort_order: 100 }, "main_category_id");
    cleanup.push(`/main-category/${main.main_category_id}`);
    const category = await post("/category", { main_category_id: main.main_category_id, category_name: suffix, description: "Signer selection", sort_order: 100 }, "category_id");
    cleanup.push(`/category/${category.category_id}`);
    const scopeResponse = await page.request.get(`${api}/catalog-scopes/default`);
    expect(scopeResponse.status()).toBe(200);
    const scope = await scopeResponse.json();
    const scopedMain = await post(`/catalog-scope/${scope.scope_id}/main-category`, { main_category_name: suffix, description: "Signer selection", sort_order: 100 }, "scope_main_category_id");
    cleanup.push(`/catalog-scope-main-category/${scopedMain.scope_main_category_id}`);
    const scopedCategory = await post(`/catalog-scope/${scope.scope_id}/category`, { main_category_id: main.main_category_id, category_name: suffix, description: "Signer selection", sort_order: 100 }, "scope_category_id");
    cleanup.push(`/catalog-scope-category/${scopedCategory.scope_category_id}`);
    const type = await post("/test-type", { test_name: suffix, validity_duration: 12, description: "Signer selection" }, "test_id");
    cleanup.push(`/test-type/${type.test_id}`);
    const allowedCategory = await post("/competency-category", { category_code: suffix, category_name: suffix, description: "Allowed signer", active: true }, "competency_category_id");
    const otherCategory = await post("/competency-category", { category_code: `other-${suffix}`, category_name: `Other ${suffix}`, description: "Other signer", active: true }, "competency_category_id");
    const personInput = { full_name: `Eligible ${suffix}`, person_type: "Internal", organization: "Porto Marine", competency_category_id: allowedCategory.competency_category_id, active: true };
    const eligible = await post("/competent-person", personInput, "competent_person_id");
    const unsigned = await post("/competent-person", { ...personInput, full_name: `Unsigned ${suffix}` }, "competent_person_id");
    const inactive = await post("/competent-person", { ...personInput, full_name: `Inactive ${suffix}`, active: false }, "competent_person_id");
    const wrongCategory = await post("/competent-person", { ...personInput, full_name: `Wrong ${suffix}`, competency_category_id: otherCategory.competency_category_id }, "competent_person_id");
    const blank = await post("/competent-person", { ...personInput, full_name: `Incomplete ${suffix}`, organization: "\t " }, "competent_person_id");
    const admin = await post("/user", { first_name: "Managed", last_name: "Examiner", email: adminEmail, password: adminPassword, role: "ADMIN", status: "ACTIVE" }, "user_id");
    cleanup.push(`/user/${admin.user_id}`);
    const asset = await post("/asset", { name: suffix, description: "Signer selection", photo: "", datasheet: "", status: "ACTIVE", asset_kind: "COMPONENTIZED", location: "Warehouse", assigned_project: "" }, "asset_id");
    cleanup.push(`/asset/${asset.asset_id}`);
    const component = await post("/component", { asset_id: asset.asset_id, category_id: category.category_id, scope_category_id: scopedCategory.scope_category_id, name: suffix, serial_number: suffix, manufacturer: "PMS", model: "Signer", location: "Warehouse", assigned_project: "", equipment_type: "Equipment", structure: "Fixed", class: "A", class_code: "A1", safety_critical: "YES", description: "Signer selection" }, "component_id");
    cleanup.push(`/component/${component.component_id}`);
    const certificateInput = { component_id: component.component_id, certificate_name: suffix, test_id: type.test_id, issue_date: "2026-01-02T00:00:00Z", expiry_date: "2027-01-02T00:00:00Z", certificate_file: "", issuing_authority: "PMS", imca_ref: "D018", imca_d018: "Signer selection", maintenance_notes: "", competency_category_ids: [allowedCategory.competency_category_id] };
    const certificate = await post("/certificate", certificateInput, "certificate_id");
    cleanup.push(`/certificate/${certificate.certificate_id}`);
    expect(certificate.competency_category_ids).toEqual([allowedCategory.competency_category_id]);
    const unrestricted = await post("/certificate", { ...certificateInput, certificate_name: `Unrestricted ${suffix}`, competency_category_ids: [] }, "certificate_id");
    cleanup.push(`/certificate/${unrestricted.certificate_id}`);
    expect(unrestricted.competency_category_ids).toEqual([]);
    const certificateURL = `/assets/${asset.asset_id}/components/${component.component_id}/certificates/${certificate.certificate_id}`;
    const certificateAPI = `${api}/certificate/${certificate.certificate_id}`;
    const unrestrictedURL = `/assets/${asset.asset_id}/components/${component.component_id}/certificates/${unrestricted.certificate_id}`;
    const unrestrictedAPI = `${api}/certificate/${unrestricted.certificate_id}`;
    const personAPI = `${api}/competent-person/${eligible.competent_person_id}/signing-profile`;
    const adminAPI = `${api}/user/${admin.user_id}/signing-profile`;
    // Populate excluded people too: inactivity/category, rather than a missing
    // image, must be the reason they are absent from the generated dropdown.
    for (const person of [inactive, wrongCategory, blank]) {
      const response = await page.request.post(`${api}/competent-person/${person.competent_person_id}/signing-profile/signature`, { multipart: { file: { name: "signature.png", mimeType: "image/png", buffer: signaturePNG } } });
      expect(response.status(), await response.text()).toBe(200);
    }

    await page.goto("/administration");
    const management = page.getByRole("region", { name: "Certificate signer management", exact: true });
    await expect(management).toBeVisible();
    await select("Competent person signature", eligible.full_name);
    await expect(management.getByText("No competent person signature saved.", { exact: true })).toBeVisible();
    const file = management.locator('input[type="file"]');
    await file.setInputFiles({ name: "signature.png", mimeType: "image/png", buffer: signaturePNG });
    await management.getByRole("button", { name: "Save competent person signature", exact: true }).click();
    const preview = management.getByRole("img", { name: "Saved signature or stamp", exact: true });
    await expect(preview).toHaveJSProperty("naturalWidth", 120);
    const firstProfile = await page.request.get(personAPI);
    expect(firstProfile.status()).toBe(200);
    const firstID = (await firstProfile.json()).signature.signature_id;
    const firstImage = await page.request.get(`${personAPI}/signatures/${firstID}/file`);
    expect(firstImage.status()).toBe(200);
    const firstBytes = await firstImage.body();
    await file.setInputFiles({ name: "replacement.jpg", mimeType: "image/jpeg", buffer: signatureJPEG });
    await management.getByRole("button", { name: "Save competent person signature", exact: true }).click();
    await expect(preview).toHaveJSProperty("naturalWidth", 160);
    await expect(preview).toHaveJSProperty("naturalHeight", 64);
    const retained = await page.request.get(`${personAPI}/signatures/${firstID}/file`);
    expect(retained.status()).toBe(200);
    expect(await retained.body()).toEqual(firstBytes);
    await file.setInputFiles({ name: "invalid.png", mimeType: "image/png", buffer: pdf });
    await management.getByRole("button", { name: "Save competent person signature", exact: true }).click();
    await expect(management.getByText("choose a valid PNG or JPEG signature image", { exact: true })).toBeVisible();
    await file.setInputFiles([]);

    await select("Admin signing account", adminEmail);
    await select("Admin signing competency category", allowedCategory.category_name);
    await management.getByRole("button", { name: "Save admin signing category", exact: true }).click();
    await expect(page.getByText("Admin signing category saved", { exact: true })).toBeVisible();
    const assigned = await page.request.get(adminAPI);
    expect(assigned.status()).toBe(200);
    expect((await assigned.json()).competency_category_id).toBe(allowedCategory.competency_category_id);
    for (const width of [320, 768, 1024, 1440]) {
      await narrow(width);
      await expect(management.getByLabel("Admin signing competency category", { exact: true })).toBeVisible();
      await expect(preview).toBeVisible();
      expect((await preview.boundingBox())!.width).toBeLessThanOrEqual(width);
    }
    await page.reload();
    await select("Admin signing account", adminEmail);
    await expect(management.getByLabel("Admin signing competency category", { exact: true })).toContainText(allowedCategory.category_name);

    await page.goto(certificateURL);
    const signing = page.getByRole("region", { name: "Generated certificate signing", exact: true });
    await expect(signing).toBeVisible();
    await signing.getByLabel("Generated certificate competent person", { exact: true }).click();
    await expect(page.getByRole("option", { name: new RegExp(eligible.full_name) })).toBeVisible();
    for (const person of [unsigned, inactive, wrongCategory, blank]) await expect(page.getByRole("option", { name: new RegExp(person.full_name) })).toHaveCount(0);
    await page.getByRole("option", { name: new RegExp(eligible.full_name) }).click();
    await expect(signing.getByRole("img", { name: "Saved signature or stamp", exact: true })).toHaveJSProperty("naturalWidth", 160);
    const eligibleResponse = await page.request.get(`${certificateAPI}/generated-signers`);
    expect(eligibleResponse.status()).toBe(200);
    expect((await eligibleResponse.json()).map((row: { signer_id: string }) => row.signer_id)).toEqual([eligible.competent_person_id]);
    const unrestrictedChoices = await page.request.get(`${unrestrictedAPI}/generated-signers`);
    expect(unrestrictedChoices.status()).toBe(200);
    expect((await unrestrictedChoices.json()).map((row: { signer_id: string }) => row.signer_id).sort()).toEqual([eligible.competent_person_id, wrongCategory.competent_person_id].sort());
    expect((await page.request.post(`${unrestrictedAPI}/generated-signer`, { data: { signer_id: wrongCategory.competent_person_id } })).status()).toBe(200);
    expect((await page.request.post(`${certificateAPI}/generated-signer`, { data: { signer_id: wrongCategory.competent_person_id } })).status()).toBe(400);

    // Changing the person after selection must invalidate the server resolver.
    const deactivate = await page.request.put(`${api}/competent-person/${eligible.competent_person_id}`, { data: { ...personInput, active: false } });
    expect(deactivate.status()).toBe(200);
    const rejected = await page.request.post(`${certificateAPI}/generated-signer`, { data: { signer_id: eligible.competent_person_id } });
    expect(rejected.status()).toBe(400);
    await page.reload();
    await expect(signing.getByText(/No eligible competent person has a saved signature/)).toBeVisible();
    expect((await page.request.put(`${api}/competent-person/${eligible.competent_person_id}`, { data: personInput })).status()).toBe(200);

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    // Sign-out clears the root's persisted token. Obtain a fresh API token for
    // category changes and cleanup, independently of the ordinary admin UI.
    const rootLogin = await request.post(`${api}/login`, { data: { email: rootEmail, password: rootPassword } });
    expect(rootLogin.status()).toBe(200);
    cleanupHeaders = { Authorization: `Bearer ${(await rootLogin.json()).token}` };
    await loginUI(adminEmail, adminPassword);
    await page.goto(certificateURL);
    await expect(signing.getByText(/Your signing profile is not eligible/)).toBeVisible();
    await page.goto("/account");
    await page.locator('input[type="file"]').setInputFiles({ name: "own.png", mimeType: "image/png", buffer: signaturePNG });
    await page.getByRole("button", { name: "Save signature", exact: true }).click();
    await expect(page.getByRole("img", { name: "Saved signature or stamp", exact: true })).toHaveJSProperty("naturalWidth", 120);
    await page.goto(certificateURL);
    await expect(signing.getByText("Managed Examiner", { exact: true })).toBeVisible();
    await expect(signing.getByLabel("Generated certificate competent person", { exact: true })).toHaveCount(0);
    await expect(signing.getByRole("img", { name: "Saved signature or stamp", exact: true })).toHaveJSProperty("naturalWidth", 120);
    const ownChoices = await page.request.get(`${certificateAPI}/generated-signers`);
    expect(ownChoices.status()).toBe(200);
    expect((await ownChoices.json()).map((row: { signer_id: string }) => row.signer_id)).toEqual([admin.user_id]);
    expect((await page.request.get(personAPI)).status()).toBe(403);
    expect((await page.request.put(adminAPI, { data: { competency_category_id: otherCategory.competency_category_id } })).status()).toBe(403);
    expect((await page.request.post(`${certificateAPI}/generated-signer`, { data: { signer_id: eligible.competent_person_id } })).status()).toBe(403);
    // Category rules are creation-time configuration. Compare two real records
    // instead of trying to alter them through an unsupported PATCH field.
    const categoryB = await request.put(adminAPI, { headers: cleanupHeaders, data: { competency_category_id: otherCategory.competency_category_id } });
    expect(categoryB.status()).toBe(200);
    await page.reload();
    await expect(signing.getByText(/Your signing profile is not eligible/)).toBeVisible();
    expect((await page.request.post(`${certificateAPI}/generated-signer`, { data: {} })).status()).toBe(400);
    await page.goto(unrestrictedURL);
    await expect(signing.getByText("Managed Examiner", { exact: true })).toBeVisible();
    await expect(signing.getByLabel("Generated certificate competent person", { exact: true })).toHaveCount(0);
    await expect(signing.getByRole("img", { name: "Saved signature or stamp", exact: true })).toHaveJSProperty("naturalWidth", 120);
    expect((await page.request.post(`${unrestrictedAPI}/generated-signer`, { data: {} })).status()).toBe(200);
    const categoryA = await request.put(adminAPI, { headers: cleanupHeaders, data: { competency_category_id: allowedCategory.competency_category_id } });
    expect(categoryA.status()).toBe(200);
    await page.goto(certificateURL);
    for (const width of [320, 768, 1024, 1440]) {
      await narrow(width);
      await expect(signing.getByText("Managed Examiner", { exact: true })).toBeVisible();
      await expect(signing.getByRole("img", { name: "Saved signature or stamp", exact: true })).toBeVisible();
    }
    const cleared = await request.put(adminAPI, { headers: cleanupHeaders, data: { competency_category_id: null } });
    expect(cleared.status()).toBe(200);
    await page.reload();
    await expect(signing.getByText(/Your signing profile is not eligible/)).toBeVisible();
    await expect(signing.getByRole("img", { name: "Saved signature or stamp", exact: true })).toHaveCount(0);
    expect((await page.request.post(`${certificateAPI}/generated-signer`, { data: {} })).status()).toBe(400);
    await page.goto("/administration");
    await expect(page.getByRole("heading", { name: "Administration", exact: true })).toBeVisible();
    await expect(management).toHaveCount(0);
  } finally {
    for (const path of cleanup.reverse()) {
      const response = cleanupHeaders ? await request.delete(`${api}${path}`, { headers: cleanupHeaders }) : await page.request.delete(`${api}${path}`);
      expect([200, 404], `cleanup managed signer fixture ${path}`).toContain(response.status());
    }
  }
});

test("ADMIN saves and replaces their own private signing image through Account while other roles cannot use it", async ({ page, request }) => {
  const rootEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL;
  const rootPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
  expect(rootEmail, "runner super admin email").toBeTruthy();
  expect(rootPassword, "runner super admin password").toBeTruthy();
  expect(process.env.AMS_TEST_STORAGE_PREFIX, "runner storage scope").toBeTruthy();
  const rootLogin = await request.post(`${api}/login`, { data: { email: rootEmail, password: rootPassword } });
  expect(rootLogin.status()).toBe(200);
  const headers = { Authorization: `Bearer ${(await rootLogin.json()).token}` };
  const suffix = `signing-${Date.now()}`;
  const password = "Signing-profile-test-123!";
  const accounts: Array<{ user_id: string; email: string }> = [];
  const accountPath = "/account/signing-profile";
  const loginUI = async (email: string, accountPassword: string) => {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(accountPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
  };
  const ownProfile = async () => {
    const response = await page.request.get(`${api}${accountPath}`);
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
  };
  try {
    for (const [role, firstName] of [["ADMIN", "Own"], ["ADMIN", "Other"], ["USER", "Restricted"]]) {
      const email = `${firstName.toLowerCase()}-${suffix}@example.com`;
      const response = await request.post(`${api}/user`, { headers, data: { first_name: firstName, last_name: "Examiner", email, password, role, status: "ACTIVE" } });
      expect(response.status(), await response.text()).toBe(201);
      accounts.push({ user_id: (await response.json()).user_id, email });
    }
    await loginUI(accounts[0].email, password);
    await expect(page.getByRole("heading", { name: "Certificate signing profile", exact: true })).toBeVisible();
    await expect(page.getByText("No signature saved. Upload your signature or stamp below.", { exact: true })).toBeVisible();
    const initial = await ownProfile();
    expect(initial.full_name).toBe("Own Examiner");
    expect(initial.competency_category_id).toBeNull();
    expect(initial.signature).toBeNull();

    const organization = page.getByLabel("Signing organization", { exact: true });
    await expect(organization).toHaveValue("Porto Marine Services L.L.C.");
    await organization.fill(" ");
    await expect(page.getByText("Enter an organization between 1 and 200 characters.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save signing details", exact: true })).toBeDisabled();
    await organization.fill("Porto Marine — Inspection");
    await page.getByRole("button", { name: "Save signing details", exact: true }).click();
    await expect(page.getByText("Signing details saved", { exact: true })).toBeVisible();
    await page.reload();
    await expect(organization).toHaveValue("Porto Marine — Inspection");

    const file = page.locator('input[type="file"]');
    await file.setInputFiles({ name: "signature.png", mimeType: "image/png", buffer: signaturePNG });
    await page.getByRole("button", { name: "Save signature", exact: true }).click();
    const preview = page.getByRole("img", { name: "Saved signature or stamp", exact: true });
    await expect(preview).toBeVisible();
    await expect(preview).toHaveJSProperty("naturalWidth", 120);
    await expect(preview).toHaveJSProperty("naturalHeight", 48);
    const first = (await ownProfile()).signature;
    const originalResponse = await page.request.get(`${api}${accountPath}/signatures/${first.signature_id}/file`);
    expect(originalResponse.status()).toBe(200);
    expect(originalResponse.headers()["cache-control"]).toBe("no-store");
    const originalBytes = await originalResponse.body();
    expect(createHash("sha256").update(originalBytes).digest("hex")).toBe(first.sha256);

    await file.setInputFiles({ name: "signature.jpg", mimeType: "image/jpeg", buffer: signatureJPEG });
    await page.getByRole("button", { name: "Save signature", exact: true }).click();
    await expect(preview).toHaveJSProperty("naturalWidth", 160);
    await expect(preview).toHaveJSProperty("naturalHeight", 64);
    const second = (await ownProfile()).signature;
    expect(second.signature_id).not.toBe(first.signature_id);
    const retainedResponse = await page.request.get(`${api}${accountPath}/signatures/${first.signature_id}/file`);
    expect(retainedResponse.status()).toBe(200);
    expect(await retainedResponse.body()).toEqual(originalBytes);
    await page.reload();
    await expect(preview).toHaveJSProperty("naturalWidth", 160);
    expect((await ownProfile()).signature.signature_id).toBe(second.signature_id);

    await file.setInputFiles({ name: "fake-signature.png", mimeType: "image/png", buffer: pdf });
    await page.getByRole("button", { name: "Save signature", exact: true }).click();
    await expect(page.getByText("choose a valid PNG or JPEG signature image", { exact: true })).toBeVisible();
    expect((await ownProfile()).signature.signature_id).toBe(second.signature_id);
    await file.setInputFiles({ name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
    await expect(page.getByText("Choose a signature image of 2 MB or smaller.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save signature", exact: true })).toBeDisabled();
    await file.setInputFiles([]);

    const spoof = await page.request.put(`${api}${accountPath}`, { data: { organization: "Changed", competency_category_id: "00000000-0000-0000-0000-000000000001" } });
    expect(spoof.status()).toBe(400);
    expect((await ownProfile()).competency_category_id).toBeNull();
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      // Desktop navigation becomes a mobile drawer when the viewport narrows.
      // Cloudscape hides the main content while that drawer is open.
      const closeNavigation = page.getByRole("button", { name: "Close primary navigation", exact: true });
      if (width < 1101 && await closeNavigation.isVisible()) {
        await closeNavigation.click();
        await expect(page.getByRole("button", { name: "Open primary navigation", exact: true })).toBeVisible();
      }
      await expect(organization).toBeVisible();
      await expect(preview).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    }

    const otherLogin = await request.post(`${api}/login`, { data: { email: accounts[1].email, password } });
    expect(otherLogin.status()).toBe(200);
    const otherHeaders = { Authorization: `Bearer ${(await otherLogin.json()).token}` };
    const forbiddenRead = await request.get(`${api}${accountPath}/signatures/${first.signature_id}/file`, { headers: otherHeaders });
    expect(forbiddenRead.status()).toBe(404);
    const otherProfile = await request.get(`${api}${accountPath}?user_id=${accounts[0].user_id}`, { headers: otherHeaders });
    expect(otherProfile.status()).toBe(200);
    expect((await otherProfile.json()).user_id).toBe(accounts[1].user_id);
    expect((await otherProfile.json()).signature).toBeNull();

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await loginUI(accounts[2].email, password);
    await expect(page.getByRole("heading", { name: "Certificate signing profile", exact: true })).toHaveCount(0);
    const restrictedProfile = await page.request.get(`${api}${accountPath}`);
    expect(restrictedProfile.status()).toBe(403);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    // Use the already-authenticated root API context to check its role gate.
    const superAdminProfile = await request.get(`${api}${accountPath}`, { headers });
    expect(superAdminProfile.status()).toBe(403);
  } finally {
    for (const account of accounts.reverse()) {
      const response = await request.delete(`${api}/user/${account.user_id}`, { headers });
      expect([200, 404], `cleanup signing account ${account.user_id}`).toContain(response.status());
    }
  }
});
