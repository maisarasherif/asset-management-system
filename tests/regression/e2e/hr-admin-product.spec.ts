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

type ProductRole = "ADMIN" | "USER" | "VIEWER";
type SubjectType = "PERSON" | "VEHICLE" | "COMPANY";

interface CreatedUser {
  user_id: string;
  email: string;
}

interface CreatedRecordType {
  record_type_id: string;
  type_name: string;
}

interface NotificationConfiguration {
  product_key: "HR_ADMIN";
  email_recipients: string;
  clickup_list_id: string;
  clickup_assignee_ids: string;
  default_reminder_days: number[];
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

async function getJson<T>(request: APIRequestContext, path: string, token?: string) {
  const response = await request.get(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  await expect(response, `GET ${path}`).toBeOK();
  return (await response.json()) as T;
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

  if (!response.ok()) {
    throw new Error(`POST ${path} failed with ${response.status()}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function putJson<T>(
  request: APIRequestContext,
  token: string,
  path: string,
  data: unknown
) {
  const response = await request.put(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });

  if (!response.ok()) {
    throw new Error(`PUT ${path} failed with ${response.status()}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function deleteIfPresent(request: APIRequestContext, token: string, path: string) {
  const response = await request.delete(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  expect([200, 404]).toContain(response.status());
}

async function createHRAdminUser(
  request: APIRequestContext,
  token: string,
  suffix: string,
  productRole: ProductRole
) {
  const password = `HrAdmin-${productRole}-${suffix}!`;
  const user = await postJson<CreatedUser>(request, token, "/user", {
    first_name: "HR",
    last_name: productRole,
    email: `pw-hr-admin-${productRole.toLowerCase()}-${suffix}@example.com`,
    password,
    role: "USER",
    status: "ACTIVE",
  });

  await postJson(request, token, "/platform/product-access", {
    user_id: user.user_id,
    product_key: "HR_ADMIN",
    product_role: productRole,
    status: "ACTIVE",
  });

  return { ...user, password, productRole };
}

async function createRecordType(
  request: APIRequestContext,
  token: string,
  subjectType: SubjectType,
  typeName: string,
  renewalBehavior: "RENEWABLE" | "ONE_TIME"
) {
  return postJson<CreatedRecordType>(request, token, "/hr-admin/compliance-record-types", {
    subject_type: subjectType,
    type_name: typeName,
    renewal_behavior: renewalBehavior,
    default_validity_months: renewalBehavior === "RENEWABLE" ? 12 : null,
    reminder_policy_days: renewalBehavior === "RENEWABLE" ? [45, 15, 5] : [],
    requires_document: false,
    active: true,
    description: "Created by HR/Admin browser regression",
  });
}

async function restoreNotificationConfiguration(
  request: APIRequestContext,
  token: string,
  config: NotificationConfiguration | null
) {
  if (!config) {
    return;
  }

  await putJson(request, token, "/hr-admin/notification-configuration", {
    email_recipients: config.email_recipients || "",
    clickup_list_id: config.clickup_list_id || "",
    clickup_assignee_ids: config.clickup_assignee_ids || "",
    default_reminder_days: config.default_reminder_days?.length
      ? config.default_reminder_days
      : [30, 7, 1],
  });
}

async function loginStaff(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isoDateOffset(days: number, reference: Date) {
  // Renewal queue SQL compares calendar dates in Asia/Dubai, including when
  // Dubai has entered tomorrow but the UTC date has not changed yet.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference);
  const part = (type: "year" | "month" | "day") =>
    Number(parts.find((value) => value.type === type)!.value);
  const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day") + days));
  return date.toISOString();
}

async function chooseSelectOption(page: Page, label: string, optionName: string | RegExp) {
  const labelPattern =
    label === "Subject"
      ? /^Subject(?! type)/
      : new RegExp(`^${escapeRegExp(label)}(\\s|$)`);
  await page.getByRole("button", { name: labelPattern }).first().click();
  await page.getByRole("option", { name: optionName }).click();
}

async function openRowActions(page: Page, rowText: string | RegExp) {
  const row = page.getByRole("row").filter({ hasText: rowText }).first();
  await row.getByRole("button", { name: "Actions" }).click();
}

async function createPersonThroughUi(page: Page, suffix: string) {
  await page.goto("/hr-admin/persons");
  await expect(page.getByRole("heading", { name: "Persons", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create person" }).first().click();
  const createDialog = page.getByRole("dialog", { name: "Create person" });
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel("Person code").fill(`PW-HRP-${suffix}`);
  await createDialog.getByLabel("Full name").fill(`PW HR Person ${suffix}`);
  await chooseSelectOption(page, "Department", "HR & Administration");
  await createDialog.getByLabel("Role title").fill("Coordinator");
  await createDialog.getByRole("button", { name: "Create person" }).click();
  await expect(page.getByText("Person created")).toBeVisible();
  await expect(page.getByText(`PW HR Person ${suffix}`)).toBeVisible();

  await openRowActions(page, `PW HR Person ${suffix}`);
  await page.getByText("Edit", { exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit person" });
  await expect(editDialog).toBeVisible();
  await editDialog.getByLabel("Role title").fill("Compliance Coordinator");
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Person updated")).toBeVisible();
  await expect(page.getByText("Compliance Coordinator")).toBeVisible();
}

async function createVehicleThroughUi(page: Page, suffix: string) {
  await page.goto("/hr-admin/vehicles");
  await expect(page.getByRole("heading", { name: "Vehicles", exact: true })).toBeVisible();
  await expect(page.getByText("separate from AMS assets")).toBeVisible();
  await page.getByRole("button", { name: "Create vehicle" }).first().click();
  const createDialog = page.getByRole("dialog", { name: "Create vehicle" });
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel("Plate number").fill(`PW-VEH-${suffix}`);
  await createDialog.getByLabel("Make").fill("Toyota");
  await createDialog.getByLabel("Model").fill("Hiace");
  await createDialog.getByLabel("Year").fill("2024");
  await createDialog.getByRole("button", { name: "Create vehicle" }).click();
  await expect(page.getByText("Vehicle created")).toBeVisible();
  await expect(page.getByText(`PW-VEH-${suffix}`)).toBeVisible();

  await openRowActions(page, `PW-VEH-${suffix}`);
  await page.getByText("Edit", { exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit vehicle" });
  await expect(editDialog).toBeVisible();
  await editDialog.getByLabel("Model").fill("Hiace GL");
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Vehicle updated")).toBeVisible();
  await expect(page.getByText("Hiace GL")).toBeVisible();
}

async function createCompanyThroughUi(page: Page, suffix: string) {
  const companyName = `PW HR Company ${suffix}`;

  await page.goto("/hr-admin/companies");
  await expect(page.getByRole("heading", { name: "Companies", exact: true })).toBeVisible();
  await expect(page.getByText("company responsibility subjects")).toBeVisible();
  await page.getByRole("button", { name: "Create company" }).first().click();
  const createDialog = page.getByRole("dialog", { name: "Create company" });
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel("Company code").fill(`PW-HRC-${suffix}`);
  await createDialog.getByLabel("Company name").fill(companyName);
  await createDialog.getByLabel("Location").fill("Dubai");
  await createDialog.getByRole("button", { name: "Create company" }).click();
  await expect(page.getByText("Company created")).toBeVisible();
  await expect(page.getByText(companyName)).toBeVisible();

  await openRowActions(page, companyName);
  await page.getByText("Edit", { exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit company" });
  await expect(editDialog).toBeVisible();
  await editDialog.getByLabel("Location").fill("Dubai HQ");
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Company updated")).toBeVisible();
  await expect(page.getByText("Dubai HQ")).toBeVisible();

  return companyName;
}

async function createRecordTypeThroughUi(page: Page, suffix: string) {
  const typeName = `PW Visa ${suffix}`;

  await page.goto("/hr-admin/record-types");
  await expect(page.getByRole("heading", { name: "Record Types", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create record type" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create record type" });
  await expect(dialog).toBeVisible();
  await chooseSelectOption(page, "Subject type", "Person");
  await dialog.getByLabel("Type name").fill(typeName);
  await chooseSelectOption(page, "Renewal behavior", "Renewable");
  await dialog.getByLabel("Default validity months").fill("24");
  await dialog.getByLabel("Reminder days").fill("90, 30, 7");
  await dialog.getByLabel("Requires document").uncheck();
  await dialog.getByLabel("Description").fill("Browser regression renewable person record");
  await dialog.getByRole("button", { name: "Create record type" }).click();
  await expect(page.getByText("Record type created")).toBeVisible();
  await expect(page.getByText(typeName)).toBeVisible();

  return typeName;
}

async function createRecordThroughUi(
  page: Page,
  subjectType: SubjectType,
  subjectName: string,
  recordTypeName: string,
  issueDate: string,
  expiryDate: string,
  authority: string
) {
  await page.goto("/hr-admin/records");
  await expect(page.getByRole("heading", { name: "Records", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create record" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create compliance record" });
  await expect(dialog).toBeVisible();
  await chooseSelectOption(page, "Subject type", subjectType === "PERSON" ? "Person" : subjectType === "VEHICLE" ? "Vehicle" : "Company");
  await chooseSelectOption(page, "Subject", subjectName);
  await chooseSelectOption(page, "Record type", recordTypeName);
  await dialog.getByRole("textbox", { name: "Issue date" }).fill(issueDate);
  if (expiryDate) {
    await expect(dialog.getByRole("textbox", { name: "Expiry date" })).toHaveValue(expiryDate);
  }
  await dialog.getByLabel("Issuing authority").fill(authority);
  await dialog.getByLabel("Notes").fill(`Created for ${subjectName}`);
  await dialog.getByRole("button", { name: "Create record" }).click();
  await expect(page.getByText("Compliance record created")).toBeVisible();
  await expect(page.getByText(recordTypeName)).toBeVisible();
  await expect(page.getByText(subjectName)).toBeVisible();
}

test.describe("HR/Admin product E2E", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run E2E tests."
  );

  test("@dashboard-browse admin completes the HR/Admin product journey without AMS asset context", async ({
    page,
  }) => {
    const setupRequest = await playwrightRequest.newContext();
    const token = await loginApi(setupRequest);
    const originalConfig = await getJson<NotificationConfiguration>(
      setupRequest,
      "/hr-admin/notification-configuration",
      token
    );
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const personName = `PW HR Person ${suffix}`;
    const vehiclePlate = `PW-VEH-${suffix}`;
    const overviewPersonName = `PW Overview Person ${suffix}`;
    const overviewPerson = await postJson<{ person_id: string }>(setupRequest, token, "/hr-admin/persons", {
      person_code: `PW-OV-${suffix}`,
      full_name: overviewPersonName,
      department: "HR & Administration",
      role_title: "Coordinator",
    });
    const overviewRecordType = await createRecordType(
      setupRequest,
      token,
      "PERSON",
      `PW Overview Visa ${suffix}`,
      "RENEWABLE"
    );
    const overviewReferenceDate = new Date();
    await postJson(setupRequest, token, "/hr-admin/compliance-records", {
      subject_type: "PERSON",
      subject_id: overviewPerson.person_id,
      record_type_id: overviewRecordType.record_type_id,
      issue_date: isoDateOffset(-1, overviewReferenceDate),
      expiry_date: isoDateOffset(45, overviewReferenceDate),
      document_file: "",
      issuing_authority: "Overview Authority",
      notes: "Overview due record",
    });
    const companyRecordType = await createRecordType(
      setupRequest,
      token,
      "COMPANY",
      `PW Company License ${suffix}`,
      "ONE_TIME"
    );
    const vehicleRecordType = await createRecordType(
      setupRequest,
      token,
      "VEHICLE",
      `PW Vehicle Registration ${suffix}`,
      "RENEWABLE"
    );
    let assetRequests = 0;

    page.on("request", (request) => {
      if (request.url().includes("/v1/assets")) {
        assetRequests += 1;
      }
    });

    try {
      await loginStaff(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

      await page.goto("/hr-admin");
      await expect(page.getByRole("heading", { name: "HR/Admin overview" })).toBeVisible();
      const personsPanel = page.getByRole("button", { name: /^Persons \(/ });
      await expect(personsPanel).toHaveAttribute("aria-pressed", "false");
      await personsPanel.focus();
      await page.keyboard.press("Enter");
      await page.getByLabel("Find a person").fill(overviewPersonName);
      await page.getByRole("row").filter({ hasText: overviewPersonName }).click();
      const overviewRow = page.getByRole("row").filter({ hasText: overviewRecordType.type_name });
      await expect(overviewRow.getByText("Due now", { exact: true })).toBeVisible();
      await expect(overviewRow.getByRole("button", { name: "Renew" })).toBeVisible();
      await page.getByRole("button", { name: /^Vehicles \(/ }).hover();
      await expect(personsPanel).toHaveAttribute("aria-pressed", "true");
      await expect(overviewRow).toBeVisible();

      const assetRequestsBeforeHRAdmin = assetRequests;
      await createPersonThroughUi(page, suffix);
      await createVehicleThroughUi(page, suffix);
      const companyName = await createCompanyThroughUi(page, suffix);
      await page.goto("/hr-admin");
      await page.getByRole("button", { name: /^Companies \(/ }).click();
      await page.getByLabel("Find a company").fill(companyName);
      await page.getByRole("row").filter({ hasText: companyName }).click();
      await expect(page.getByText("This subject has no compliance records.")).toBeVisible();
      const personRecordType = await createRecordTypeThroughUi(page, suffix);

      await createRecordThroughUi(
        page,
        "PERSON",
        personName,
        personRecordType,
        "01/01/2026",
        "01/01/2028",
        "Dubai Authority"
      );

      await openRowActions(page, personRecordType);
      await page.getByText("Add version", { exact: true }).click();
      const versionDialog = page.getByRole("dialog", { name: /Add version for/ });
      await expect(versionDialog).toBeVisible();
      await versionDialog
        .getByRole("textbox", { name: "Issue date" })
        .fill("01/01/2028");
      await expect(
        versionDialog.getByRole("textbox", { name: "Expiry date" }),
      ).toHaveValue("01/01/2030");
      await versionDialog.getByLabel("Issuing authority").fill("Dubai Authority Renewal");
      await versionDialog.getByLabel("Notes").fill("Renewed by browser regression");
      await versionDialog.getByRole("button", { name: "Add version" }).click();
      await expect(page.getByText("Record version added")).toBeVisible();
      await expect(page.getByText(/v2/)).toBeVisible();

      await createRecordThroughUi(
        page,
        "VEHICLE",
        vehiclePlate,
        vehicleRecordType.type_name,
        "01/02/2026",
        "01/02/2027",
        "RTA"
      );
      await createRecordThroughUi(
        page,
        "COMPANY",
        companyName,
        companyRecordType.type_name,
        "01/03/2026",
        "",
        "Company Registrar"
      );

      await page.goto("/hr-admin/companies");
      await openRowActions(page, companyName);
      await page.getByText("Archive", { exact: true }).click();
      const archiveCompanyDialog = page.getByRole("dialog", { name: /Archive/ });
      await expect(archiveCompanyDialog).toBeVisible();
      await archiveCompanyDialog.getByLabel("Archive reason").fill("Company no longer used by test");
      await archiveCompanyDialog.getByRole("button", { name: "Archive company" }).click();
      await expect(page.getByText("Company archived")).toBeVisible();

      await page.goto("/hr-admin");
      await page.getByRole("button", { name: /^Companies \(/ }).click();
      await page.getByLabel("Find a company").fill(companyName);
      await page.getByRole("row").filter({ hasText: companyName }).click();
      const companyRecord = page.getByRole("row").filter({ hasText: companyRecordType.type_name });
      await expect(companyRecord).toContainText("No expiry");
      await expect(companyRecord.getByRole("button", { name: "Renew" })).toHaveCount(0);
      await page.getByLabel("Find a company").fill("no-such-company-" + suffix);
      await expect(page.getByText("No matching subjects.")).toBeVisible();
      await expect(companyRecord).toHaveCount(0);

      await page.goto("/hr-admin/records");
      await openRowActions(page, personRecordType);
      await page.getByText("Archive", { exact: true }).click();
      const archiveDialog = page.getByRole("dialog", { name: /Archive/ });
      await expect(archiveDialog).toBeVisible();
      await archiveDialog.getByLabel("Archive reason").fill("Superseded by test policy");
      await archiveDialog.getByRole("button", { name: "Archive record" }).click();
      await expect(page.getByText("Compliance record archived")).toBeVisible();
      await expect(page.getByText("Archived").first()).toBeVisible();

      await page.goto("/hr-admin/reminder-policy");
      await expect(page.getByRole("heading", { name: "Reminder Policy" })).toBeVisible();
      await expect(page.getByText("Current asset")).toHaveCount(0);
      await page.getByLabel("Default reminder days").fill("66, 33, 6");
      await expect(page.getByText("66 days before expiry")).toBeVisible();
      await page.getByRole("button", { name: "Save policy" }).click();
      await expect(page.getByText("Reminder policy saved")).toBeVisible();

      await page.goto("/hr-admin/notification-config");
      await expect(page.getByRole("heading", { name: "Notification Config" })).toBeVisible();
      await expect(page.getByText("Current asset")).toHaveCount(0);
      await expect(page.getByText("Default reminder days remain 66, 33, 6.")).toBeVisible();
      await page.getByLabel("Email recipients").fill(`hr-${suffix}@example.com, ops-${suffix}@example.com`);
      await page.getByLabel("ClickUp list ID").fill(`list-${suffix}`);
      await page.getByLabel("ClickUp assignee IDs").fill("901,902");
      await expect(page.getByText("2 email recipients and 2 ClickUp assignees")).toBeVisible();
      await page.getByRole("button", { name: "Save config" }).click();
      await expect(page.getByText("Notification config saved")).toBeVisible();

      await page.reload();
      await expect(page.getByText("Default reminder days remain 66, 33, 6.")).toBeVisible();
      await expect(page.getByLabel("ClickUp list ID")).toHaveValue(`list-${suffix}`);

      await page.goto("/hr-admin/scheduler");
      await expect(page.getByRole("heading", { name: "HR/Admin scheduler" })).toBeVisible();
      await expect(page.getByText("Current asset")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Run scheduler now" })).toBeVisible();
      await page.getByRole("button", { name: "Run scheduler now" }).click();
      await expect(page.getByText("HR/Admin scheduler run completed")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Job audit" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Failure audit" })).toBeVisible();

      expect(assetRequests).toBe(assetRequestsBeforeHRAdmin);
    } finally {
      const restoreToken = await loginApi(setupRequest);
      await restoreNotificationConfiguration(setupRequest, restoreToken, originalConfig);
      await setupRequest.dispose();
    }
  });

  test("@dashboard-browse refreshes an open subject on the server's business-day deadline and on tab return", async ({ browser }) => {
    const api = await playwrightRequest.newContext();
    const context = await browser.newContext({ timezoneId: "America/New_York", locale: "en-US" });
    try {
      const token = await loginApi(api);
      const plate = "CLK-" + Date.now();
      const vehicle = await postJson<{ vehicle_id: string }>(api, token, "/hr-admin/vehicles", { plate_number: plate });
      const type = await createRecordType(api, token, "VEHICLE", "Clock " + plate, "RENEWABLE");
      await postJson(api, token, "/hr-admin/compliance-records", {
        subject_type: "VEHICLE", subject_id: vehicle.vehicle_id, record_type_id: type.record_type_id,
        expiry_date: "2001-11-18T18:30:00-04:00",
      });
      const page = await context.newPage();
      await loginStaff(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
      await page.clock.install();
      // Shorten only the server's scheduling hint. Counts, statuses and dates still come from PostgreSQL.
      await page.route("**/v1/hr-admin/overview", async route => {
        const response = await route.fetch();
        await route.fulfill({ response, json: { ...await response.json(), refresh_after_ms: 120_000 } });
      }, { times: 1 });
      await page.goto("/hr-admin");
      await page.getByRole("button", { name: /^Vehicles \(/ }).click();
      await page.getByLabel("Find a plate or vehicle").fill(plate);
      await page.getByRole("row").filter({ hasText: plate }).click();
      const row = page.getByRole("row").filter({ hasText: type.type_name });
      await expect(row.getByText("19 Nov 2001")).toBeVisible();
      async function expectRefresh(trigger: () => Promise<void>) {
        await Promise.all([
          page.waitForResponse(r => r.url().endsWith("/hr-admin/overview") && r.ok()),
          page.waitForResponse(r => r.url().includes("/compliance-records?") && r.url().includes(vehicle.vehicle_id) && r.ok()),
          trigger(),
        ]);
        await expect(row.getByText("Expired")).toBeVisible();
      }
      await expectRefresh(() => page.clock.fastForward(121_000));
      // Chromium headless does not consistently mark background tabs hidden.
      await expectRefresh(() => page.evaluate(() => {
        document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
      }));
    } finally {
      await context.close();
      await api.dispose();
    }
  });

  for (const zone of ["UTC", "Asia/Dubai", "America/New_York"]) {
    test("dashboard calendar dates and quick renewal in " + zone, async ({ browser }, testInfo) => {
      const api = await playwrightRequest.newContext();
      const mobile = zone === "Asia/Dubai";
      const context = await browser.newContext({
        locale: "en-US", timezoneId: zone, hasTouch: mobile, reducedMotion: "reduce",
        viewport: mobile ? { width: 390, height: 844 } : { width: 1584, height: 992 },
      });
      try {
        const token = await loginApi(api);
        const suffix = String(Date.now());
        const plate = "DB-" + suffix;
        const vehicle = await postJson<{ vehicle_id: string; updated_at: string }>(api, token, "/hr-admin/vehicles", {
          plate_number: plate, make: "Toyota", model: "Hilux", vehicle_year: 2024,
        });
        const kind = await createRecordType(api, token, "VEHICLE", "Dashboard registration " + suffix, "RENEWABLE");
        const response = await postJson<{ record: { record_id: string } }>(api, token, "/hr-admin/compliance-records", {
          subject_type: "VEHICLE", subject_id: vehicle.vehicle_id, record_type_id: kind.record_type_id,
          issue_date: "2000-11-18T22:30:00Z", expiry_date: "2001-11-18T18:30:00-04:00",
          document_file: "existing-document.pdf",
        });
        for (const [name, behavior] of [
          ["Motor insurance", "RENEWABLE"], ["Vehicle handover", "ONE_TIME"], ["Previous permit", "RENEWABLE"],
        ] as const) {
          const type = await createRecordType(api, token, "VEHICLE", name + " " + suffix, behavior);
          const created = await postJson<{ record: { record_id: string } }>(api, token, "/hr-admin/compliance-records", {
            subject_type: "VEHICLE", subject_id: vehicle.vehicle_id, record_type_id: type.record_type_id,
            issue_date: "2000-01-01T00:00:00Z",
            expiry_date: behavior === "RENEWABLE" ? isoDateOffset(7, new Date()) : null,
          });
          if (name === "Previous permit") {
            const archived = await api.patch(API_BASE_URL + "/hr-admin/compliance-records/" + created.record.record_id + "/archive", {
              headers: { Authorization: "Bearer " + token }, data: { archive_reason: "Replaced permit" },
            });
            expect(archived.status()).toBe(200);
          }
        }
        const overview = await getJson<{ groups: { subject_type: string; expired_count: number }[] }>(
          api, "/hr-admin/overview", token);
        const before = overview.groups.find(group => group.subject_type === "VEHICLE")!.expired_count;
        const page = await context.newPage();
        await loginStaff(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
        await page.goto("/hr-admin");
        const groupButtons = page.getByRole("group", { name: "Subject groups" }).getByRole("button");
        await expect(groupButtons).toHaveCount(3);
        const widths = await groupButtons.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
        expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(2);
        const vehicles = page.getByRole("button", { name: /^Vehicles \(/ });
        if (mobile) await vehicles.tap();
        else { await vehicles.focus(); await page.keyboard.press("Space"); }
        await page.getByLabel("Find a plate or vehicle").fill(plate);
        await page.getByRole("row").filter({ hasText: plate }).click();
        const row = page.getByRole("row").filter({ hasText: kind.type_name });
        await expect(row.getByText("Expired", { exact: true })).toBeVisible();
        await expect(row.getByRole("cell", { name: "19 Nov 2001" })).toBeVisible();
        await expect(page.getByRole("row").filter({ hasText: "Motor insurance " + suffix }).getByRole("button", { name: "Renew" })).toBeVisible();
        for (const name of ["Vehicle handover", "Previous permit"]) {
          const inactiveRow = page.getByRole("row").filter({ hasText: name + " " + suffix });
          await expect(inactiveRow).toBeVisible();
          await expect(inactiveRow.getByRole("button", { name: "Renew" })).toHaveCount(0);
        }
        await testInfo.attach("vehicle-dashboard", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
        const renew = row.getByRole("button", { name: "Renew" });
        await renew.click();
        const dialog = page.getByRole("dialog", { name: /Add version for/ });
        await expect(dialog.getByLabel("Issue date", { exact: true })).toHaveValue("19/11/2000");
        const expiry = dialog.getByLabel("Expiry date", { exact: true });
        await expect(expiry).toHaveValue("19/11/2001");
        await dialog.getByRole("button", { name: "Cancel" }).click();
        await expect(row.getByText("Expired")).toBeVisible();
        await renew.click();
        await expiry.fill("18/11/2000");
        await dialog.getByRole("button", { name: "Add version" }).click();
        await expect(dialog.getByText("Expiry date must be after issue date.")).toBeVisible();
        await expiry.fill("19/11/2099");
        if (zone === "UTC") {
          await page.route("**/compliance-records/" + response.record.record_id + "/versions", route =>
            route.fulfill({ status: 503, json: { error: "Renewal service temporarily unavailable" } }), { times: 1 });
          await dialog.getByRole("button", { name: "Add version" }).click();
          await expect(dialog.getByText("Renewal service temporarily unavailable")).toBeVisible();
          await expect(expiry).toHaveValue("19/11/2099");
        }
        await dialog.getByRole("button", { name: "Add version" }).click();
        await expect(dialog).toHaveCount(0);
        await expect(row.getByText("Valid", { exact: true })).toBeVisible();
        await expect(row.getByRole("cell", { name: "19 Nov 2099" })).toBeVisible();
        await expect(vehicles).toContainText(String(before - 1) + " expired");
        await expect(page.getByRole("row").filter({ hasText: plate }).getByRole("radio")).toBeChecked();
        await renew.click();
        await expect(expiry).toHaveValue("19/11/2099");
        await dialog.getByRole("button", { name: "Cancel" }).click();
        // Signing in through the UI replaces the admin's fixture token. Use the browser's current cookie.
        const history = await getJson<{ version_number: number; document_file: string; is_current: boolean }[]>(
          page.request, `/hr-admin/compliance-records/${response.record.record_id}/versions`);
        expect(history.map(v => [v.version_number, v.is_current, v.document_file])).toEqual([
          [2, true, "existing-document.pdf"], [1, false, "existing-document.pdf"],
        ]);

        // The desktop subject list shows the event timestamp from the real API.
        await page.setViewportSize({ width: 1584, height: 992 });
        await page.goto("/hr-admin/vehicles");
        const vehicleRow = page.getByRole("row").filter({ hasText: plate });
        const formatEvent = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric",
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "shortOffset" });
        await expect(vehicleRow.getByText(formatEvent.format(new Date(vehicle.updated_at)))).toBeVisible();
        if (zone === "America/New_York") {
          // Supplemental presentation fixtures cover both DST offsets independently of the VPS run date.
          for (const instant of ["2026-07-19T10:00:00Z", "2026-11-19T10:00:00Z"]) {
            await page.route("**/v1/hr-admin/vehicles?**", async route => {
              const response = await route.fetch();
              const body = await response.json();
              const v = body.data.find((item: {vehicle_id: string}) => item.vehicle_id === vehicle.vehicle_id);
              v.updated_at = instant;
              await route.fulfill({ response, json: body });
            }, { times: 1 });
            await page.reload();
            await expect(vehicleRow.getByText(formatEvent.format(new Date(instant)))).toBeVisible();
          }
        }
      } finally {
        await context.close();
        await api.dispose();
      }
    });
  }

  test("HR/Admin USER and VIEWER see only their scoped product actions", async ({
    browser,
  }) => {
    const setupRequest = await playwrightRequest.newContext();
    const token = await loginApi(setupRequest);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const personName = `PW Role Person ${suffix}`;
    const recordType = await createRecordType(
      setupRequest,
      token,
      "PERSON",
      `PW Role Visa ${suffix}`,
      "RENEWABLE"
    );
    const person = await postJson<{ person_id: string }>(setupRequest, token, "/hr-admin/persons", {
      person_code: `PW-ROLE-${suffix}`,
      full_name: personName,
      department: "HR & Administration",
      role_title: "Coordinator",
    });
    await postJson(setupRequest, token, "/hr-admin/compliance-records", {
      subject_type: "PERSON",
      subject_id: person.person_id,
      record_type_id: recordType.record_type_id,
      issue_date: "2026-01-01T00:00:00Z",
      expiry_date: "2028-01-01T00:00:00Z",
      document_file: "",
      issuing_authority: "Role Authority",
      notes: "Role boundary record",
    });
    const createdUsers: CreatedUser[] = [];

    try {
      const user = await createHRAdminUser(setupRequest, token, suffix, "USER");
      const viewer = await createHRAdminUser(setupRequest, token, suffix, "VIEWER");
      createdUsers.push(user, viewer);

      const userContext = await browser.newContext();
      const userPage = await userContext.newPage();
      await loginStaff(userPage, user.email, user.password);
      await userPage.goto("/hr-admin/persons");
      await expect(userPage.getByRole("button", { name: "Create person" })).toBeVisible();
      await expect(userPage.getByRole("button", { name: `Actions for ${personName}` })).toHaveCount(0);
      await expect(userPage.getByRole("button", { name: "Edit" }).first()).toBeVisible();
      await userPage.goto("/hr-admin/companies");
      await expect(userPage.getByRole("heading", { name: "Companies", exact: true })).toBeVisible();
      await expect(userPage.getByRole("button", { name: "Create company" }).first()).toBeVisible();
      await userPage.goto("/hr-admin/records");
      await expect(userPage.getByText(recordType.type_name)).toBeVisible();
      await openRowActions(userPage, recordType.type_name);
      await expect(userPage.getByText("Add version", { exact: true })).toBeVisible();
      await expect(userPage.getByText("Archive", { exact: true })).toHaveCount(0);
      await userContext.close();

      const viewerContext = await browser.newContext();
      const viewerPage = await viewerContext.newPage();
      await loginStaff(viewerPage, viewer.email, viewer.password);
      await viewerPage.goto("/hr-admin/persons");
      await expect(viewerPage.getByText("Viewer access allows you to inspect and download records")).toBeVisible();
      await expect(viewerPage.getByRole("button", { name: "Create person" })).toHaveCount(0);
      await viewerPage.goto("/hr-admin/companies");
      await expect(viewerPage.getByText("Viewer access allows you to inspect and download records")).toBeVisible();
      await expect(viewerPage.getByRole("button", { name: "Create company" })).toHaveCount(0);
      await viewerPage.goto("/hr-admin/records");
      await expect(viewerPage.getByText(recordType.type_name)).toBeVisible();
      await expect(viewerPage.getByText("View only").first()).toBeVisible();
      await expect(viewerPage.getByRole("button", { name: "Create record" })).toHaveCount(0);
      await viewerContext.close();

      for (const account of [user, viewer]) {
        const context = await browser.newContext();
        const page = await context.newPage();

        await loginStaff(page, account.email, account.password);
        await page.goto("/hr-admin");
        await page.getByRole("button", { name: /^Persons \(/ }).click();
        await page.getByLabel("Find a person").fill(personName);
        await page.getByRole("row").filter({ hasText: personName }).click();
        const selectedRecord = page.getByRole("row").filter({ hasText: recordType.type_name });
        await expect(selectedRecord).toBeVisible();
        await expect(selectedRecord.getByRole("button", { name: "Renew" })).toHaveCount(account === user ? 1 : 0);

        await page.goto("/hr-admin/record-types");
        await expect(page).toHaveURL(/\/hr-admin$/);
        await expect(page.getByRole("heading", { name: "Record Types" })).toHaveCount(0);

        await page.goto("/hr-admin/reminder-policy");
        await expect(page).toHaveURL(/\/hr-admin$/);
        await expect(page.getByRole("heading", { name: "Reminder Policy" })).toHaveCount(0);

        await page.goto("/hr-admin/notification-config");
        await expect(page).toHaveURL(/\/hr-admin$/);
        await expect(page.getByRole("heading", { name: "Notification Config" })).toHaveCount(0);

        await page.goto("/hr-admin/scheduler");
        await expect(page).toHaveURL(/\/hr-admin$/);
        await expect(page.getByRole("heading", { name: "HR/Admin scheduler" })).toHaveCount(0);

        await context.close();
      }
    } finally {
      for (const user of createdUsers.reverse()) {
        await deleteIfPresent(setupRequest, token, `/user/${user.user_id}`);
      }
      await setupRequest.dispose();
    }
  });
});
