import { expect, test, type Page, type Route } from "@playwright/test";

const futureExpiry = "2099-01-01T00:00:00.000Z";

type RecordedRequest = {
  method: string;
  path: string;
  body: unknown;
  contentType: string;
};

function paginated<T>(data: T[]) {
  return {
    data,
    meta: {
      page: 1,
      limit: 100,
      total: data.length,
      total_pages: 1,
    },
  };
}

function message(messageText = "ok") {
  return { message: messageText };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function templateTests(component: {
  tests?: unknown;
}): Array<Record<string, any>> {
  return Array.isArray(component.tests) ? component.tests : [];
}

function createMockState() {
  const asset = {
    asset_id: "asset-1",
    display_id: "AST-001",
    name: "Poseidon Lift Bag",
    photo: "",
    datasheet: "https://example.test/datasheet.pdf",
    description: "Primary lifting asset.",
    status: "ACTIVE",
    asset_kind: "COMPONENTIZED",
    location: "Deck A",
    assigned_project: "North Field",
    working_hours: 1200,
    working_hours_note: "",
    maintenance_interval_hours: 1500,
    next_maintenance_due_hours: 1500,
    maintenance_required_at: null,
    last_maintenance_completed_at: null,
    last_maintenance_completed_hours: 0,
    template_id: "tpl-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  const component = {
    component_id: "comp-1",
    display_id: "CMP-001",
    asset_id: "asset-1",
    category_id: "cat-1",
    component_kind: "STANDARD",
    single_asset_equipment_id: null,
    name: "Main Harness",
    serial_number: "SN-100",
    manufacturer: "Porto Marine",
    description: "Harness component.",
    equipment_type: "Harness",
    structure: "Frame",
    model: "HX-9",
    class: "A",
    class_code: "A1",
    safety_critical: "YES",
    location: "Deck A",
    assigned_project: "North Field",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  const singleAsset = {
    ...asset,
    asset_id: "asset-single",
    display_id: "AST-003",
    name: "Single Lift Bag",
    asset_kind: "SINGLE_EQUIPMENT",
    location: "Deck B",
    template_id: null,
  };

  const selfComponent = {
    ...component,
    component_id: "component-single",
    display_id: "CMP-SELF",
    asset_id: "asset-single",
    component_kind: "SELF",
    single_asset_equipment_id: "single-1",
    name: "Single Lift Bag",
    serial_number: "SELF-100",
  };

  const category = {
    category_id: "cat-1",
    display_id: "CAT-001",
    main_category_id: "main-1",
    sort_order: 1,
    category_name: "Lifting",
    description: "Lifting components",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  const catalogScope = {
    scope_id: "scope-1",
    display_id: "SCOPE-001",
    scope_name: "ADNOC-Approved Full Diving Spread",
    description: "Default catalog scope",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  const catalogScopeMainCategory = {
    scope_main_category_id: "scope-main-1",
    display_id: "SCOPEMAIN-001",
    scope_id: "scope-1",
    main_category_id: "main-1",
    sort_order: 1,
    main_category_display_id: "MAIN-001",
    main_category_name: "Diving Systems",
    description: "Diving system assets",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  const catalogScopeCategory = {
    scope_category_id: "scope-cat-1",
    display_id: "SCOPECAT-001",
    scope_id: "scope-1",
    main_category_id: "main-1",
    main_category_display_id: "MAIN-001",
    main_category_name: "Diving Systems",
    category_id: "cat-1",
    category_display_id: "CAT-001",
    category_name: "Lifting",
    sort_order: 1,
    description: "Lifting components",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  const mainCategory = {
    main_category_id: "main-1",
    display_id: "MAIN-001",
    sort_order: 1,
    main_category_name: "Diving Systems",
    description: "Diving system assets",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  const testType = {
    test_id: "test-1",
    display_id: "TEST-001",
    test_name: "Annual Load Test",
    validity_duration: 12,
    description: "Annual inspection",
  };

  const secondaryTestType = {
    test_id: "test-2",
    display_id: "TEST-002",
    test_name: "NDT Inspection",
    validity_duration: 6,
    description: "Non-destructive inspection",
  };

  const certificate = {
    certificate_id: "cert-1",
    display_id: "CRT-001",
    component_id: "comp-1",
    certificate_name: "Load Test Certificate",
    issue_date: "2026-01-01T00:00:00.000Z",
    expiry_date: "2027-01-01T00:00:00.000Z",
    certificate_file: "certificates/cert-1.pdf",
    issuing_authority: "DNV",
    status: "VALID",
    test_id: "test-1",
    imca_ref: "IMCA-REF",
    imca_d018: "D018",
    maintenance_notes: "No issues.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  const singleCertificate = {
    ...certificate,
    certificate_id: "cert-single",
    display_id: "CRT-SINGLE",
    component_id: "component-single",
    certificate_name: "Single Equipment Certificate",
    certificate_file: "certificates/cert-single.pdf",
  };

  const template = {
    template_id: "tpl-1",
    display_id: "TPL-001",
    template_name: "Diving Harness Template",
    description: "Reusable harness setup.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  const templateComponent = {
    template_component_id: "tc-1",
    display_id: "TC-001",
    template_id: "tpl-1",
    category_id: "cat-1",
    scope_category_id: "scope-cat-1",
    position: 1,
    name: "Harness Blueprint",
    description: "Template component.",
    serial_number: "",
    manufacturer: "Porto Marine",
    equipment_type: "Harness",
    structure: "Frame",
    model: "HX",
    class: "A",
    class_code: "A1",
    safety_critical: "YES",
    location: "Deck A",
    assigned_project: "North Field",
    created_at: "2026-01-01T00:00:00.000Z",
    tests: [
      {
        template_component_test_id: "tct-1",
        template_component_test_display_id: "TCT-001",
        template_component_id: "tc-1",
        test_id: "test-1",
        position: 1,
        created_at: "2026-01-01T00:00:00.000Z",
        test_name: "Annual Load Test",
        validity_duration: 12,
        description: "Annual inspection",
      },
    ],
  };

  const templateComponentWithoutTests = {
    ...templateComponent,
    template_component_id: "tc-2",
    display_id: "TC-002",
    position: 2,
    name: "Spare Blueprint",
    tests: null,
  };

  const maintenanceEvent = {
    maintenance_event_id: "maint-1",
    display_id: "RM-001",
    asset_id: "asset-1",
    due_at_hours: 1500,
    triggered_at_hours: 1500,
    previous_asset_status: "ACTIVE",
    status: "REQUIRED",
    clickup_task_id: "CU-1",
    notification_error: "",
    notified_at: "2026-01-03T00:00:00.000Z",
    completed_at: null,
    completion_notes: "",
    created_at: "2026-01-03T00:00:00.000Z",
  };

  const project = {
    project_id: "project-1",
    project_name: "North Field",
    description: "North field work",
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  const clientUser = {
    user_id: "user-client",
    first_name: "Client",
    last_name: "Viewer",
    email: "client@example.test",
    role: "CLIENT",
    status: "ACTIVE",
    can_manage_user_passwords: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  const adminUser = {
    ...clientUser,
    user_id: "user-admin",
    first_name: "Ada",
    last_name: "Admin",
    email: "admin@example.test",
    role: "SUPER_ADMIN",
    can_manage_user_passwords: true,
  };

  const access = {
    access_id: "access-1",
    user_id: "user-client",
    user_name: "Client Viewer",
    user_email: "client@example.test",
    user_status: "ACTIVE",
    project_id: "project-1",
    project_name: "North Field",
    project_status: "ACTIVE",
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  const competentPerson = {
    competent_person_id: "person-1",
    full_name: "Casey Competent",
    person_type: "Internal",
    organization: "Porto Marine",
    competency_category_id: "cc-1",
    competency_category_code: "AUTH",
    competency_category_name: "Authorized Inspector",
    competency_category_description: "Can renew certificates.",
    active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  const competencyCategory = {
    competency_category_id: "cc-1",
    category_code: "AUTH",
    category_name: "Authorized Inspector",
    description: "Can renew certificates.",
    active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  const userAuditLog = {
    audit_id: "audit-1",
    actor_user_id: "user-admin",
    actor_email: "admin@example.test",
    action: "USER_CREATED",
    target_user_id: "user-client",
    target_email: "client@example.test",
    target_role_before: "",
    target_role_after: "CLIENT",
    details: "Seed audit entry",
    ip_address: "127.0.0.1",
    created_at: "2026-01-02T00:00:00.000Z",
  };

  const upload = {
    uuid: "upload-1",
    certificate_id: "cert-1",
    file_key: "certificates/upload-1.pdf",
    file_name: "old-certificate.pdf",
    uploaded_by_name: "Ada Admin",
    uploaded_at: "2026-01-02T00:00:00.000Z",
    competent_person_id: "person-1",
    competent_person_name: "Casey Competent",
    competent_person_type: "Internal",
    competency_category_id: "cc-1",
    competency_category_code: "AUTH",
    competency_category_name: "Authorized Inspector",
    competency_category_description: "Can renew certificates.",
  };

  const equipmentType = {
    equipment_type_id: "equipment-1",
    display_id: "EQ-001",
    sort_order: 1,
    equipment_type_name: "Lift Bag Assembly",
    description: "Single-asset lift bag equipment.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  return {
    access: [access],
    asset,
    catalogScopeCategories: [catalogScopeCategory],
    catalogScopeMainCategories: [catalogScopeMainCategory],
    catalogScopes: [catalogScope],
    categories: [category],
    certificate,
    competencyCategories: [competencyCategory],
    competentPeople: [competentPerson],
    component,
    equipmentTypes: [equipmentType],
    mainCategories: [mainCategory],
    maintenanceEvents: [maintenanceEvent],
    projects: [project],
    recorded: [] as RecordedRequest[],
    selfComponent,
    singleAsset,
    singleCertificate,
    template,
    templateConfiguration: [templateComponent, templateComponentWithoutTests],
    testTypes: [testType, secondaryTestType],
    unexpected: [] as string[],
    uploads: [upload],
    createdCertificates: [] as Array<typeof certificate>,
    createdUploads: [] as Array<typeof upload>,
    failNextCertificateUploadWithHtml413: false,
    userAuditLogs: [userAuditLog],
    users: [adminUser, clientUser],
  };
}

async function parseRequest(route: Route): Promise<RecordedRequest> {
  const request = route.request();
  const contentType = request.headers()["content-type"] || "";
  let body: unknown = null;

  if (request.method() !== "GET" && request.method() !== "HEAD") {
    if (contentType.includes("application/json")) {
      body = request.postDataJSON();
    } else if (contentType.includes("multipart/form-data")) {
      body = request.postData() || "";
    } else {
      body = request.postData();
    }
  }

  const url = new URL(request.url());
  return {
    method: request.method(),
    path: `${url.pathname}${url.search}`,
    body,
    contentType,
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installMockApi(page: Page) {
  const state = createMockState();

  await page.addInitScript(() => {
    window.open = (url?: string | URL) => {
      window.localStorage.setItem("lastWindowOpen", String(url || ""));
      return null;
    };
  });

  await page.route("**/v1/**", async (route) => {
    const request = await parseRequest(route);
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/v1/, "");
    const method = route.request().method();

    state.recorded.push(request);

    if (path === "/session" && method === "GET") {
      return fulfillJson(route, {
        user_id: "user-admin",
        first_name: "Ada",
        last_name: "Admin",
        email: "admin@example.test",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        expires_at: futureExpiry,
        can_manage_user_passwords: true,
      });
    }

    if (path === "/assets" && method === "GET") {
      return fulfillJson(route, paginated([state.asset]));
    }

    if (path === "/asset/asset-1" && method === "GET") {
      return fulfillJson(route, state.asset);
    }

    if (path === "/asset/asset-1" && method === "PUT") {
      state.asset = {
        ...state.asset,
        ...(request.body as object),
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      return fulfillJson(route, message("asset updated"));
    }

    if (path === "/asset/asset-created" && method === "GET") {
      return fulfillJson(route, state.asset);
    }

    if (path === "/asset/asset-single" && method === "GET") {
      return fulfillJson(route, state.singleAsset);
    }

    if (path === "/asset/asset-single/single-equipment" && method === "GET") {
      return fulfillJson(route, {
        single_asset_equipment_id: "single-1",
        display_id: "SAE-001",
        asset_id: "asset-single",
        equipment_type_id: "equipment-1",
        equipment_type_name: "Lift Bag Assembly",
        self_component_id: "component-single",
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-05T00:00:00.000Z",
      });
    }

    if (path === "/asset/asset-created/single-equipment" && method === "GET") {
      return fulfillJson(route, {
        single_asset_equipment_id: "single-1",
        display_id: "SAE-001",
        asset_id: "asset-created",
        equipment_type_id: "equipment-1",
        equipment_type_name: "Lift Bag Assembly",
        self_component_id: "component-created",
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-05T00:00:00.000Z",
      });
    }

    if (path === "/asset" && method === "POST") {
      const payload = request.body as typeof state.asset & {
        single_equipment?: unknown;
      };
      state.asset = {
        ...state.asset,
        ...payload,
        asset_id: "asset-created",
        display_id: "AST-002",
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      return fulfillJson(route, state.asset);
    }

    if (path === "/asset/asset-1/working-hours" && method === "PATCH") {
      const payload = request.body as { working_hours: number; note: string };
      state.asset = {
        ...state.asset,
        working_hours: payload.working_hours,
        working_hours_note: payload.note,
      };
      return fulfillJson(route, {
        asset: state.asset,
        maintenance_event: state.maintenanceEvents[0],
      });
    }

    if (path === "/asset/asset-1/routine-maintenance" && method === "GET") {
      return fulfillJson(route, state.maintenanceEvents);
    }

    if (
      path === "/asset/asset-created/routine-maintenance" &&
      method === "GET"
    ) {
      return fulfillJson(route, []);
    }

    if (
      path === "/asset/asset-single/routine-maintenance" &&
      method === "GET"
    ) {
      return fulfillJson(route, []);
    }

    if (
      path === "/asset/asset-1/routine-maintenance/complete" &&
      method === "POST"
    ) {
      const payload = request.body as { completion_notes: string };
      state.maintenanceEvents = state.maintenanceEvents.map((event) =>
        event.maintenance_event_id === "maint-1"
          ? {
              ...event,
              status: "COMPLETED",
              completion_notes: payload.completion_notes,
              completed_at: "2026-01-04T00:00:00.000Z",
            }
          : event,
      );
      return fulfillJson(route, {
        asset: state.asset,
        maintenance_event: state.maintenanceEvents[0],
      });
    }

    if (path === "/components/asset/asset-1" && method === "GET") {
      return fulfillJson(route, paginated([state.component]));
    }

    if (path === "/components/asset/asset-created" && method === "GET") {
      return fulfillJson(route, paginated([]));
    }

    if (path === "/components/asset/asset-single" && method === "GET") {
      return fulfillJson(route, paginated([state.selfComponent]));
    }

    if (path === "/component/comp-1" && method === "GET") {
      return fulfillJson(route, state.component);
    }

    if (path === "/component/comp-1" && method === "PUT") {
      state.component = {
        ...state.component,
        ...(request.body as object),
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      return fulfillJson(route, message("component updated"));
    }

    if (path === "/categories" && method === "GET") {
      return fulfillJson(route, paginated(state.categories));
    }

    if (path === "/category" && method === "POST") {
      const payload = request.body as Omit<
        (typeof state.categories)[number],
        "category_id" | "display_id" | "created_at" | "updated_at"
      >;
      const nextCategory = {
        ...payload,
        category_id: "cat-2",
        display_id: "CAT-002",
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      state.categories = [...state.categories, nextCategory];
      return fulfillJson(route, nextCategory);
    }

    if (/^\/category\/cat-\d+$/.test(path) && method === "PUT") {
      const categoryId = path.split("/")[2];
      const payload = request.body as Partial<
        (typeof state.categories)[number]
      >;
      state.categories = state.categories.map((category) =>
        category.category_id === categoryId
          ? { ...category, ...payload, updated_at: "2026-01-05T00:00:00.000Z" }
          : category,
      );
      return fulfillJson(route, message("category updated"));
    }

    if (/^\/category\/cat-\d+$/.test(path) && method === "DELETE") {
      const categoryId = path.split("/")[2];
      state.categories = state.categories.filter(
        (category) => category.category_id !== categoryId,
      );
      return fulfillJson(route, message("category deleted"));
    }

    if (path === "/main-categories" && method === "GET") {
      return fulfillJson(route, paginated(state.mainCategories));
    }

    if (path === "/main-category" && method === "POST") {
      const payload = request.body as Omit<
        (typeof state.mainCategories)[number],
        "main_category_id" | "display_id" | "created_at" | "updated_at"
      >;
      const nextMainCategory = {
        ...payload,
        main_category_id: "main-2",
        display_id: "MAIN-002",
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      state.mainCategories = [...state.mainCategories, nextMainCategory];
      return fulfillJson(route, nextMainCategory);
    }

    if (/^\/main-category\/main-\d+$/.test(path) && method === "PUT") {
      const mainCategoryId = path.split("/")[2];
      const payload = request.body as Partial<
        (typeof state.mainCategories)[number]
      >;
      state.mainCategories = state.mainCategories.map((mainCategory) =>
        mainCategory.main_category_id === mainCategoryId
          ? {
              ...mainCategory,
              ...payload,
              updated_at: "2026-01-05T00:00:00.000Z",
            }
          : mainCategory,
      );
      return fulfillJson(route, message("main category updated"));
    }

    if (/^\/main-category\/main-\d+$/.test(path) && method === "DELETE") {
      const mainCategoryId = path.split("/")[2];
      state.mainCategories = state.mainCategories.filter(
        (mainCategory) => mainCategory.main_category_id !== mainCategoryId,
      );
      state.categories = state.categories.filter(
        (category) => category.main_category_id !== mainCategoryId,
      );
      return fulfillJson(route, message("main category deleted"));
    }

    if (path === "/test-types" && method === "GET") {
      return fulfillJson(route, state.testTypes);
    }

    if (path === "/test-type" && method === "POST") {
      const payload = request.body as Omit<
        (typeof state.testTypes)[number],
        "test_id" | "display_id"
      >;
      const nextTestType = {
        ...payload,
        test_id: "test-3",
        display_id: "TEST-003",
      };
      state.testTypes = [...state.testTypes, nextTestType];
      return fulfillJson(route, nextTestType);
    }

    if (/^\/test-type\/test-\d+$/.test(path) && method === "PUT") {
      const testId = path.split("/")[2];
      const payload = request.body as Partial<(typeof state.testTypes)[number]>;
      state.testTypes = state.testTypes.map((testType) =>
        testType.test_id === testId ? { ...testType, ...payload } : testType,
      );
      return fulfillJson(route, message("test type updated"));
    }

    if (/^\/test-type\/test-\d+$/.test(path) && method === "DELETE") {
      const testId = path.split("/")[2];
      state.testTypes = state.testTypes.filter(
        (testType) => testType.test_id !== testId,
      );
      return fulfillJson(route, message("test type deleted"));
    }

    if (path === "/equipment-types" && method === "GET") {
      return fulfillJson(route, paginated(state.equipmentTypes));
    }

    if (path === "/equipment-type" && method === "POST") {
      const payload = request.body as Omit<
        (typeof state.equipmentTypes)[number],
        "equipment_type_id" | "display_id" | "created_at" | "updated_at"
      >;
      const nextEquipmentType = {
        ...payload,
        equipment_type_id: "equipment-2",
        display_id: "EQ-002",
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      state.equipmentTypes = [...state.equipmentTypes, nextEquipmentType];
      return fulfillJson(route, nextEquipmentType);
    }

    if (/^\/equipment-type\/equipment-\d+$/.test(path) && method === "PUT") {
      const equipmentTypeId = path.split("/")[2];
      const payload = request.body as Partial<
        (typeof state.equipmentTypes)[number]
      >;
      state.equipmentTypes = state.equipmentTypes.map((equipmentType) =>
        equipmentType.equipment_type_id === equipmentTypeId
          ? {
              ...equipmentType,
              ...payload,
              updated_at: "2026-01-05T00:00:00.000Z",
            }
          : equipmentType,
      );
      return fulfillJson(route, message("equipment type updated"));
    }

    if (/^\/equipment-type\/equipment-\d+$/.test(path) && method === "DELETE") {
      const equipmentTypeId = path.split("/")[2];
      state.equipmentTypes = state.equipmentTypes.filter(
        (equipmentType) => equipmentType.equipment_type_id !== equipmentTypeId,
      );
      return fulfillJson(route, message("equipment type deleted"));
    }

    if (path === "/template/tpl-1" && method === "GET") {
      return fulfillJson(route, state.template);
    }

    if (path === "/template/tpl-1" && method === "PUT") {
      state.template = {
        ...state.template,
        ...(request.body as object),
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      return fulfillJson(route, message("template updated"));
    }

    if (path === "/template/tpl-1" && method === "DELETE") {
      return fulfillJson(route, message("template deleted"));
    }

    if (path === "/templates" && method === "GET") {
      return fulfillJson(route, [state.template]);
    }

    if (path === "/catalog-scopes" && method === "GET") {
      return fulfillJson(route, state.catalogScopes);
    }

    if (path === "/catalog-scope/scope-1/main-categories" && method === "GET") {
      return fulfillJson(route, paginated(state.catalogScopeMainCategories));
    }

    if (path === "/catalog-scope/scope-1/main-category" && method === "POST") {
      const payload = request.body as Omit<
        (typeof state.catalogScopeMainCategories)[number],
        | "scope_main_category_id"
        | "display_id"
        | "scope_id"
        | "main_category_id"
        | "main_category_display_id"
        | "created_at"
        | "updated_at"
      >;
      const nextMainCategoryId = "main-2";
      const nextScopeMainCategory = {
        ...payload,
        scope_main_category_id: "scope-main-2",
        display_id: "SCOPEMAIN-002",
        scope_id: "scope-1",
        main_category_id: nextMainCategoryId,
        main_category_display_id: "MAIN-002",
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      state.catalogScopeMainCategories = [
        ...state.catalogScopeMainCategories,
        nextScopeMainCategory,
      ];
      state.mainCategories = [
        ...state.mainCategories,
        {
          main_category_id: nextMainCategoryId,
          display_id: "MAIN-002",
          sort_order: payload.sort_order,
          main_category_name: payload.main_category_name,
          description: payload.description,
          created_at: "2026-01-05T00:00:00.000Z",
          updated_at: "2026-01-05T00:00:00.000Z",
        },
      ];
      return fulfillJson(route, nextScopeMainCategory);
    }

    if (
      /^\/catalog-scope-main-category\/scope-main-\d+$/.test(path) &&
      method === "PUT"
    ) {
      const scopeMainCategoryId = path.split("/")[2];
      const payload = request.body as Partial<
        (typeof state.catalogScopeMainCategories)[number]
      >;
      state.catalogScopeMainCategories = state.catalogScopeMainCategories.map(
        (mainCategory) =>
          mainCategory.scope_main_category_id === scopeMainCategoryId
            ? {
                ...mainCategory,
                ...payload,
                updated_at: "2026-01-05T00:00:00.000Z",
              }
            : mainCategory,
      );
      return fulfillJson(route, message("scope main category updated"));
    }

    if (
      /^\/catalog-scope-main-category\/scope-main-\d+$/.test(path) &&
      method === "DELETE"
    ) {
      const scopeMainCategoryId = path.split("/")[2];
      const removed = state.catalogScopeMainCategories.find(
        (mainCategory) =>
          mainCategory.scope_main_category_id === scopeMainCategoryId,
      );
      state.catalogScopeMainCategories =
        state.catalogScopeMainCategories.filter(
          (mainCategory) =>
            mainCategory.scope_main_category_id !== scopeMainCategoryId,
        );
      if (removed) {
        state.catalogScopeCategories = state.catalogScopeCategories.filter(
          (category) => category.main_category_id !== removed.main_category_id,
        );
      }
      return fulfillJson(route, message("scope main category deleted"));
    }

    if (path === "/catalog-scope/scope-1/categories" && method === "GET") {
      return fulfillJson(route, paginated(state.catalogScopeCategories));
    }

    if (path === "/catalog-scope/scope-1/category" && method === "POST") {
      const payload = request.body as Omit<
        (typeof state.catalogScopeCategories)[number],
        | "scope_category_id"
        | "display_id"
        | "scope_id"
        | "category_id"
        | "category_display_id"
        | "main_category_display_id"
        | "main_category_name"
        | "created_at"
        | "updated_at"
      >;
      const mainCategory = state.catalogScopeMainCategories.find(
        (item) => item.main_category_id === payload.main_category_id,
      )!;
      const nextCategory = {
        ...payload,
        scope_category_id: "scope-cat-2",
        display_id: "SCOPECAT-002",
        scope_id: "scope-1",
        main_category_display_id: mainCategory.main_category_display_id,
        main_category_name: mainCategory.main_category_name,
        category_id: "cat-2",
        category_display_id: "CAT-002",
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      state.catalogScopeCategories = [
        ...state.catalogScopeCategories,
        nextCategory,
      ];
      state.categories = [
        ...state.categories,
        {
          category_id: "cat-2",
          display_id: "CAT-002",
          main_category_id: payload.main_category_id,
          sort_order: payload.sort_order,
          category_name: payload.category_name,
          description: payload.description,
          created_at: "2026-01-05T00:00:00.000Z",
          updated_at: "2026-01-05T00:00:00.000Z",
        },
      ];
      return fulfillJson(route, nextCategory);
    }

    if (
      /^\/catalog-scope-category\/scope-cat-\d+$/.test(path) &&
      method === "PUT"
    ) {
      const scopeCategoryId = path.split("/")[2];
      const payload = request.body as Partial<
        (typeof state.catalogScopeCategories)[number]
      >;
      const mainCategory = state.catalogScopeMainCategories.find(
        (item) => item.main_category_id === payload.main_category_id,
      );
      state.catalogScopeCategories = state.catalogScopeCategories.map(
        (category) =>
          category.scope_category_id === scopeCategoryId
            ? {
                ...category,
                ...payload,
                main_category_display_id:
                  mainCategory?.main_category_display_id ||
                  category.main_category_display_id,
                main_category_name:
                  mainCategory?.main_category_name ||
                  category.main_category_name,
                updated_at: "2026-01-05T00:00:00.000Z",
              }
            : category,
      );
      return fulfillJson(route, message("scope category updated"));
    }

    if (
      /^\/catalog-scope-category\/scope-cat-\d+$/.test(path) &&
      method === "DELETE"
    ) {
      const scopeCategoryId = path.split("/")[2];
      state.catalogScopeCategories = state.catalogScopeCategories.filter(
        (category) => category.scope_category_id !== scopeCategoryId,
      );
      return fulfillJson(route, message("scope category deleted"));
    }

    if (path === "/template/tpl-1/configuration" && method === "GET") {
      return fulfillJson(route, state.templateConfiguration);
    }

    if (path === "/template/tpl-1/configuration" && method === "PUT") {
      const payload = request.body as {
        components: Array<
          Partial<(typeof state.templateConfiguration)[number]> & {
            test_ids?: string[];
          }
        >;
      };

      state.templateConfiguration = payload.components.map(
        (componentPayload, index) => {
          const existing = state.templateConfiguration.find(
            (component) =>
              component.template_component_id ===
              componentPayload.template_component_id,
          );
          const testIds = componentPayload.test_ids || [];
          const nextComponentId =
            componentPayload.template_component_id || `tc-${index + 1}`;
          const nextTests = testIds.map((testId, testIndex) => {
            const testType = state.testTypes.find(
              (item) => item.test_id === testId,
            )!;
            const templateComponentTestId = `tct-${index + 1}-${testIndex + 1}`;
            return {
              template_component_test_id: templateComponentTestId,
              template_component_test_display_id:
                templateComponentTestId.toUpperCase(),
              template_component_id: nextComponentId,
              test_id: testId,
              position: testIndex + 1,
              created_at: "2026-01-05T00:00:00.000Z",
              test_name: testType.test_name,
              validity_duration: testType.validity_duration,
              description: testType.description,
            };
          });
          const componentFields = { ...componentPayload };
          delete componentFields.test_ids;

          return {
            ...existing,
            ...componentFields,
            template_component_id: nextComponentId,
            display_id:
              existing?.display_id ||
              `TC-${String(index + 1).padStart(3, "0")}`,
            template_id: "tpl-1",
            position: index + 1,
            created_at: existing?.created_at || "2026-01-05T00:00:00.000Z",
            tests: nextTests,
          };
        },
      );

      return fulfillJson(route, {
        message: "template configured successfully",
        components_configured: state.templateConfiguration.length,
        tests_assigned: state.templateConfiguration.reduce(
          (count, component) => count + templateTests(component).length,
          0,
        ),
      });
    }

    if (path === "/template/tpl-1/component" && method === "POST") {
      const payload = request.body as Omit<
        (typeof state.templateConfiguration)[number],
        | "template_component_id"
        | "display_id"
        | "template_id"
        | "position"
        | "created_at"
        | "tests"
      >;
      const nextPosition = state.templateConfiguration.length + 1;
      const nextComponent = {
        ...payload,
        template_component_id: `tc-${nextPosition}`,
        display_id: `TC-${String(nextPosition).padStart(3, "0")}`,
        template_id: "tpl-1",
        position: nextPosition,
        created_at: "2026-01-05T00:00:00.000Z",
        tests: [],
      };
      state.templateConfiguration = [
        ...state.templateConfiguration,
        nextComponent,
      ];
      return fulfillJson(route, nextComponent);
    }

    if (/^\/template-component\/tc-\d+$/.test(path) && method === "PUT") {
      const templateComponentId = path.split("/")[2];
      const payload = request.body as Partial<
        (typeof state.templateConfiguration)[number]
      >;
      state.templateConfiguration = state.templateConfiguration.map(
        (component) =>
          component.template_component_id === templateComponentId
            ? { ...component, ...payload }
            : component,
      );
      return fulfillJson(route, message("template component updated"));
    }

    if (/^\/template-component\/tc-\d+$/.test(path) && method === "DELETE") {
      const templateComponentId = path.split("/")[2];
      state.templateConfiguration = state.templateConfiguration.filter(
        (component) => component.template_component_id !== templateComponentId,
      );
      return fulfillJson(route, message("template component deleted"));
    }

    if (
      /^\/template-component\/tc-\d+\/test$/.test(path) &&
      method === "POST"
    ) {
      const templateComponentId = path.split("/")[2];
      const payload = request.body as { test_id: string };
      const testType = state.testTypes.find(
        (item) => item.test_id === payload.test_id,
      )!;
      const nextTestId = `tct-${state.templateConfiguration.reduce((count, component) => count + templateTests(component).length, 0) + 1}`;
      const nextTest = {
        template_component_test_id: nextTestId,
        template_component_test_display_id: nextTestId.toUpperCase(),
        template_component_id: templateComponentId,
        test_id: payload.test_id,
        position: 1,
        created_at: "2026-01-05T00:00:00.000Z",
        test_name: testType.test_name,
        validity_duration: testType.validity_duration,
        description: testType.description,
      };
      state.templateConfiguration = state.templateConfiguration.map(
        (component) =>
          component.template_component_id === templateComponentId
            ? { ...component, tests: [...templateTests(component), nextTest] }
            : component,
      );
      return fulfillJson(route, nextTest);
    }

    if (
      /^\/template-component-test\/tct-\d+$/.test(path) &&
      method === "DELETE"
    ) {
      const templateComponentTestId = path.split("/")[2];
      state.templateConfiguration = state.templateConfiguration.map(
        (component) => ({
          ...component,
          tests: templateTests(component).filter(
            (testItem) =>
              testItem.template_component_test_id !== templateComponentTestId,
          ),
        }),
      );
      return fulfillJson(route, message("template component test deleted"));
    }

    if (path === "/projects" && method === "GET") {
      return fulfillJson(route, state.projects);
    }

    if (path === "/project" && method === "POST") {
      const payload = request.body as {
        project_name: string;
        description: string;
        status: string;
      };
      const nextProject = {
        project_id: "project-2",
        project_name: payload.project_name,
        description: payload.description,
        status: payload.status,
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      state.projects = [...state.projects, nextProject];
      return fulfillJson(route, nextProject);
    }

    if (path === "/user-project-access" && method === "GET") {
      return fulfillJson(route, state.access);
    }

    if (path === "/user/user-client/project-access" && method === "POST") {
      const payload = request.body as { project_id: string; status: string };
      const project =
        state.projects.find((item) => item.project_id === payload.project_id) ||
        state.projects[0];
      const nextAccess = {
        access_id: "access-2",
        user_id: "user-client",
        user_name: "Client Viewer",
        user_email: "client@example.test",
        user_status: "ACTIVE",
        project_id: project.project_id,
        project_name: project.project_name,
        project_status: project.status,
        status: payload.status,
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      state.access = [...state.access, nextAccess];
      return fulfillJson(route, nextAccess);
    }

    if (path === "/user-project-access/access-1" && method === "PUT") {
      const payload = request.body as { status: string };
      state.access = state.access.map((item) =>
        item.access_id === "access-1"
          ? { ...item, status: payload.status }
          : item,
      );
      return fulfillJson(route, message("access updated"));
    }

    if (path === "/user-project-access/access-1" && method === "DELETE") {
      state.access = state.access.filter(
        (item) => item.access_id !== "access-1",
      );
      return fulfillJson(route, message("access deleted"));
    }

    if (path === "/users" && method === "GET") {
      return fulfillJson(route, paginated(state.users));
    }

    if (path === "/user" && method === "POST") {
      const payload = request.body as (typeof state.users)[number] & {
        password: string;
      };
      const nextUser = {
        user_id: "user-created",
        first_name: payload.first_name,
        last_name: payload.last_name,
        email: payload.email,
        role: payload.role,
        status: payload.status,
        can_manage_user_passwords: false,
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      state.users = [...state.users, nextUser];
      return fulfillJson(route, nextUser);
    }

    if (/^\/user\/user-(client|created)$/.test(path) && method === "PUT") {
      const userId = path.split("/")[2];
      const payload = request.body as Partial<(typeof state.users)[number]>;
      state.users = state.users.map((user) =>
        user.user_id === userId
          ? { ...user, ...payload, updated_at: "2026-01-05T00:00:00.000Z" }
          : user,
      );
      return fulfillJson(route, message("user updated"));
    }

    if (
      /^\/user\/user-(client|created)\/password$/.test(path) &&
      method === "PUT"
    ) {
      return fulfillJson(route, message("password updated"));
    }

    if (/^\/user\/user-(client|created)$/.test(path) && method === "DELETE") {
      const userId = path.split("/")[2];
      state.users = state.users.filter((user) => user.user_id !== userId);
      return fulfillJson(route, message("user deleted"));
    }

    if (path === "/user-management-audit-logs" && method === "GET") {
      return fulfillJson(route, paginated(state.userAuditLogs));
    }

    if (path === "/competency-categories" && method === "GET") {
      return fulfillJson(route, paginated(state.competencyCategories));
    }

    if (path === "/competency-category" && method === "POST") {
      const payload = request.body as Omit<
        (typeof state.competencyCategories)[number],
        "competency_category_id" | "created_at" | "updated_at"
      >;
      const nextCategory = {
        ...payload,
        competency_category_id: "cc-2",
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      state.competencyCategories = [
        ...state.competencyCategories,
        nextCategory,
      ];
      return fulfillJson(route, nextCategory);
    }

    if (/^\/competency-category\/cc-\d+$/.test(path) && method === "PUT") {
      const competencyCategoryId = path.split("/")[2];
      const payload = request.body as Partial<
        (typeof state.competencyCategories)[number]
      >;
      state.competencyCategories = state.competencyCategories.map((category) =>
        category.competency_category_id === competencyCategoryId
          ? { ...category, ...payload, updated_at: "2026-01-05T00:00:00.000Z" }
          : category,
      );
      return fulfillJson(route, message("competency category updated"));
    }

    if (path === "/competent-persons" && method === "GET") {
      return fulfillJson(route, paginated(state.competentPeople));
    }

    if (path === "/competent-persons/active" && method === "GET") {
      return fulfillJson(route, state.competentPeople);
    }

    if (path === "/competent-person" && method === "POST") {
      const payload = request.body as Omit<
        (typeof state.competentPeople)[number],
        | "competent_person_id"
        | "competency_category_code"
        | "competency_category_name"
        | "competency_category_description"
        | "created_at"
        | "updated_at"
      >;
      const competencyCategory =
        state.competencyCategories.find(
          (category) =>
            category.competency_category_id === payload.competency_category_id,
        ) || state.competencyCategories[0];
      const nextPerson = {
        ...payload,
        competent_person_id: "person-2",
        competency_category_code: competencyCategory.category_code,
        competency_category_name: competencyCategory.category_name,
        competency_category_description: competencyCategory.description,
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      state.competentPeople = [...state.competentPeople, nextPerson];
      return fulfillJson(route, nextPerson);
    }

    if (/^\/competent-person\/person-\d+$/.test(path) && method === "PUT") {
      const competentPersonId = path.split("/")[2];
      const payload = request.body as Partial<
        (typeof state.competentPeople)[number]
      >;
      const competencyCategory = state.competencyCategories.find(
        (category) =>
          category.competency_category_id === payload.competency_category_id,
      );
      state.competentPeople = state.competentPeople.map((person) =>
        person.competent_person_id === competentPersonId
          ? {
              ...person,
              ...payload,
              ...(competencyCategory
                ? {
                    competency_category_code: competencyCategory.category_code,
                    competency_category_name: competencyCategory.category_name,
                    competency_category_description:
                      competencyCategory.description,
                  }
                : {}),
              updated_at: "2026-01-05T00:00:00.000Z",
            }
          : person,
      );
      return fulfillJson(route, message("competent person updated"));
    }

    if (path === "/certificate/cert-1" && method === "GET") {
      return fulfillJson(route, state.certificate);
    }

    if (path === "/certificate/cert-created" && method === "GET") {
      return fulfillJson(
        route,
        state.createdCertificates[0] ?? state.certificate,
      );
    }

    if (path === "/certificate" && method === "POST") {
      const payload = request.body as Partial<typeof state.certificate>;
      const nextCertificate = {
        ...state.certificate,
        ...payload,
        certificate_id: "cert-created",
        display_id: "CRT-002",
        certificate_file: "",
        status: "VALID",
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      state.createdCertificates = [nextCertificate];
      return fulfillJson(route, nextCertificate);
    }

    if (path === "/certificate/cert-1" && method === "PATCH") {
      state.certificate = {
        ...state.certificate,
        ...(request.body as object),
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      return fulfillJson(route, message("certificate patched"));
    }

    if (path === "/certificate/cert-1/file" && method === "GET") {
      return fulfillJson(route, { url: "https://example.test/cert-1.pdf" });
    }

    if (path === "/certificate/cert-single/file" && method === "GET") {
      return fulfillJson(route, {
        url: "https://example.test/cert-single.pdf",
      });
    }

    if (path === "/certificate/cert-1/file" && method === "POST") {
      if (state.failNextCertificateUploadWithHtml413) {
        state.failNextCertificateUploadWithHtml413 = false;
        return route.fulfill({
          status: 413,
          contentType: "text/html",
          body: "<html><body><h1>413 Request Entity Too Large</h1><center>nginx/1.30.0</center></body></html>",
        });
      }
      state.uploads = [
        {
          ...state.uploads[0],
          uuid: "upload-2",
          file_key: "certificates/upload-2.pdf",
          file_name: "uploaded-from-api.pdf",
          uploaded_at: "2026-01-05T00:00:00.000Z",
        },
        ...state.uploads,
      ];
      return fulfillJson(route, message("file uploaded"));
    }

    if (path === "/certificate/cert-created/file" && method === "POST") {
      state.createdUploads = [
        {
          ...state.uploads[0],
          uuid: "upload-created",
          certificate_id: "cert-created",
          file_key: "certificates/upload-created.pdf",
          file_name: "created-certificate.pdf",
          uploaded_at: "2026-01-05T00:00:00.000Z",
        },
      ];
      return fulfillJson(route, message("file uploaded"));
    }

    if (path === "/certificate/cert-1/uploads" && method === "GET") {
      return fulfillJson(route, paginated(state.uploads));
    }

    if (path === "/certificate/cert-created/uploads" && method === "GET") {
      return fulfillJson(route, paginated(state.createdUploads));
    }

    if (
      /^\/certificate\/cert-1\/uploads\/upload-[12]\/file$/.test(path) &&
      method === "GET"
    ) {
      const uploadId = path.split("/")[4];
      return fulfillJson(route, {
        url: `https://example.test/${uploadId}.pdf`,
      });
    }

    if (path === "/certificates/component/comp-1" && method === "GET") {
      return fulfillJson(
        route,
        paginated([state.certificate, ...state.createdCertificates]),
      );
    }

    if (
      path === "/certificates/component/component-single" &&
      method === "GET"
    ) {
      return fulfillJson(route, paginated([state.singleCertificate]));
    }

    state.unexpected.push(`${method} ${path}${url.search}`);
    return fulfillJson(
      route,
      { error: `Unexpected mocked route: ${method} ${path}` },
      500,
    );
  });

  return state;
}

async function bootMockedAdmin(page: Page, path: string) {
  const state = await installMockApi(page);
  await page.goto(path);
  await expect(page.getByText("Checking authentication")).toHaveCount(0);
  return state;
}

async function expectNoUnexpectedApi(
  state: ReturnType<typeof createMockState>,
) {
  expect(state.unexpected).toEqual([]);
}

function latestRequest(
  state: ReturnType<typeof createMockState>,
  method: string,
  path: string,
) {
  const matches = state.recorded.filter(
    (request) => request.method === method && request.path === path,
  );
  expect(matches.length, `Expected ${method} ${path}`).toBeGreaterThan(0);
  return matches[matches.length - 1];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function selectOption(
  page: Page,
  triggerText: string,
  optionText: string,
) {
  await page.getByText(triggerText, { exact: true }).click();
  await page.getByRole("option", { name: new RegExp(optionText) }).click();
}

async function selectCloudscapeOption(
  page: Page,
  testId: string,
  optionText: string,
) {
  const container = page.getByTestId(testId);
  await expect(container).toBeVisible();
  await container.locator("button,[role='combobox'],input").first().click();

  const optionByRole = page.getByRole("option", {
    name: new RegExp(`^${escapeRegExp(optionText)}`),
  });
  if ((await optionByRole.count()) > 0) {
    await optionByRole.first().click();
    return;
  }

  await page.getByText(optionText, { exact: true }).last().click();
}

async function selectCloudscapeMultiOption(
  page: Page,
  testId: string,
  optionText: string,
) {
  await selectCloudscapeOption(page, testId, optionText);
  await page.keyboard.press("Escape");
}

test.describe("mocked refactored page smoke coverage", () => {
  test("TemplateDetailPage preserves edit/delete modal state, payloads, refresh, and navigation", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(page, "/templates/tpl-1");

    await expect(
      page.getByRole("heading", { name: "Diving Harness Template" }),
    ).toBeVisible();
    await expect(
      page.getByText("Harness Blueprint", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Spare Blueprint", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Annual Load Test")).toBeVisible();

    await page.getByRole("button", { name: "Edit details" }).click();
    const editDialog = page.getByRole("dialog", {
      name: "Edit template details",
    });
    await expect(editDialog).toBeVisible();
    await editDialog
      .getByLabel("Template name")
      .fill("  Updated Harness Template  ");
    await editDialog
      .getByLabel("Description")
      .fill("  Updated template description  ");
    await editDialog.getByRole("button", { name: "Save changes" }).click();

    const updateRequest = latestRequest(state, "PUT", "/v1/template/tpl-1");
    expect(updateRequest.body).toMatchObject({
      template_name: "Updated Harness Template",
      description: "Updated template description",
    });
    await expect(editDialog).toHaveCount(0);
    await expect(page.getByText("Template updated")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Updated Harness Template" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Delete template" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete template" });
    await expect(
      deleteDialog.getByText("Updated Harness Template"),
    ).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(deleteDialog).toHaveCount(0);

    await page.getByRole("button", { name: "Delete template" }).click();
    await page
      .getByRole("dialog", { name: "Delete template" })
      .getByRole("button", { name: "Delete template" })
      .click();
    latestRequest(state, "DELETE", "/v1/template/tpl-1");
    await expect(page).toHaveURL(/\/templates$/);
    await expectNoUnexpectedApi(state);
  });

  test("TemplateConfigurePage preserves create validation, payload trimming, test assignment, and refresh", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(page, "/templates/tpl-1/configure");

    await expect(
      page.getByRole("heading", { name: "Configure Diving Harness Template" }),
    ).toBeVisible();
    await expect(
      page.getByText("Harness Blueprint", { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Add component", exact: true })
      .click();
    const componentDialog = page.getByRole("dialog", {
      name: "Add template component",
    });
    await expect(componentDialog).toBeVisible();

    await componentDialog
      .getByRole("button", { name: "Save component" })
      .click();
    await expect(componentDialog.getByText("Choose a category.")).toBeVisible();
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "POST" &&
          request.path === "/v1/template/tpl-1/component",
      ),
    ).toHaveLength(0);
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "PUT" &&
          request.path === "/v1/template/tpl-1/configuration",
      ),
    ).toHaveLength(0);

    await componentDialog
      .getByLabel("Component name")
      .fill("  Wet Bell Frame  ");
    await selectCloudscapeOption(
      page,
      "template-component-category",
      "Diving Systems > Lifting",
    );
    await componentDialog
      .getByLabel("Description")
      .fill("  Blueprint component  ");
    await componentDialog.getByLabel("Serial number").fill("  WB-100  ");
    await componentDialog.getByLabel("Manufacturer").fill("  Porto Marine  ");
    await componentDialog
      .getByLabel("Assigned project")
      .fill("  South Field  ");
    await componentDialog.getByLabel("Location").fill("  Deck C  ");
    await componentDialog.getByLabel("Equipment type").fill("  Wet bell  ");
    await componentDialog.getByLabel("Structure").fill("  Frame  ");
    await componentDialog.getByLabel("Model").fill("  WBX  ");
    await componentDialog.getByLabel("Class", { exact: true }).fill("  B  ");
    await componentDialog.getByLabel("Class code").fill("  B2  ");
    await selectCloudscapeMultiOption(
      page,
      "template-component-tests",
      "Annual Load Test",
    );
    await componentDialog
      .getByRole("button", { name: "Save component" })
      .click();

    const configureRequest = latestRequest(
      state,
      "PUT",
      "/v1/template/tpl-1/configuration",
    );
    const createdComponent = (
      configureRequest.body as {
        components: Array<Record<string, unknown>>;
      }
    ).components.find((component) => component.name === "Wet Bell Frame");
    expect(createdComponent).toMatchObject({
      category_id: "cat-1",
      scope_category_id: "scope-cat-1",
      name: "Wet Bell Frame",
      description: "Blueprint component",
      serial_number: "WB-100",
      manufacturer: "Porto Marine",
      assigned_project: "South Field",
      location: "Deck C",
      equipment_type: "Wet bell",
      structure: "Frame",
      model: "WBX",
      class: "B",
      class_code: "B2",
      safety_critical: "NO",
      test_ids: ["test-1"],
    });
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "POST" &&
          request.path === "/v1/template/tpl-1/component",
      ),
    ).toHaveLength(0);
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "POST" &&
          /\/v1\/template-component\/.*\/test/.test(request.path),
      ),
    ).toHaveLength(0);
    await expect(componentDialog).toHaveCount(0);
    await expect(page.getByText("Template component added")).toBeVisible();
    await expect(
      page.getByText("Wet Bell Frame", { exact: true }),
    ).toBeVisible();
    await expectNoUnexpectedApi(state);
  });

  test("TemplateConfigurePage preserves edit test diffing, delete confirmation, and refreshed rows", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(page, "/templates/tpl-1/configure");

    await expect(
      page.getByRole("heading", { name: "Configure Diving Harness Template" }),
    ).toBeVisible();
    await page
      .getByRole("row", { name: /Harness Blueprint/ })
      .getByRole("button", { name: "Edit" })
      .click();

    const editDialog = page.getByRole("dialog", {
      name: "Edit template component",
    });
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel("Component name").fill("  Updated Blueprint  ");
    await editDialog.getByLabel("Manufacturer").fill("  Updated Maker  ");
    await selectCloudscapeMultiOption(
      page,
      "template-component-tests",
      "NDT Inspection",
    );
    await editDialog.getByRole("button", { name: "Save component" }).click();

    const updateConfigurationRequest = latestRequest(
      state,
      "PUT",
      "/v1/template/tpl-1/configuration",
    );
    const updatedComponent = (
      updateConfigurationRequest.body as {
        components: Array<Record<string, unknown>>;
      }
    ).components.find(
      (component) => component.template_component_id === "tc-1",
    );
    expect(updatedComponent).toMatchObject({
      name: "Updated Blueprint",
      manufacturer: "Updated Maker",
      test_ids: ["test-1", "test-2"],
    });
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "PUT" &&
          request.path === "/v1/template-component/tc-1",
      ),
    ).toHaveLength(0);
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "POST" &&
          request.path === "/v1/template-component/tc-1/test",
      ),
    ).toHaveLength(0);
    await expect(editDialog).toHaveCount(0);
    await expect(page.getByText("Template component updated")).toBeVisible();
    await expect(
      page.getByText("Updated Blueprint", { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("row", { name: /Updated Blueprint/ })
      .getByRole("button", { name: "Delete" })
      .click();
    const deleteDialog = page.getByRole("dialog", {
      name: "Delete template component",
    });
    await expect(deleteDialog.getByText("Updated Blueprint")).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(deleteDialog).toHaveCount(0);

    await page
      .getByRole("row", { name: /Updated Blueprint/ })
      .getByRole("button", { name: "Delete" })
      .click();
    await page
      .getByRole("dialog", { name: "Delete template component" })
      .getByRole("button", { name: "Delete" })
      .click();
    const deleteConfigurationRequest = latestRequest(
      state,
      "PUT",
      "/v1/template/tpl-1/configuration",
    );
    expect(
      (
        deleteConfigurationRequest.body as {
          components: Array<Record<string, unknown>>;
        }
      ).components.some(
        (component) => component.template_component_id === "tc-1",
      ),
    ).toBe(false);
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "DELETE" &&
          request.path === "/v1/template-component/tc-1",
      ),
    ).toHaveLength(0);
    await expect(page.getByText("Template component deleted")).toBeVisible();
    await expect(
      page.getByText("Updated Blueprint", { exact: true }),
    ).toHaveCount(0);
    await expectNoUnexpectedApi(state);
  });

  test("AssetRoutineMaintenancePage preserves hour update and completion flows", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(
      page,
      "/assets/asset-1/routine-maintenance",
    );

    await expect(
      page.getByRole("heading", { name: "Routine maintenance" }),
    ).toBeVisible();
    await expect(page.getByText("Required").first()).toBeVisible();

    await page.getByRole("button", { name: "Update hours" }).click();
    const hoursDialog = page.getByRole("dialog", {
      name: "Update working hours",
    });
    await expect(hoursDialog).toBeVisible();
    await hoursDialog.getByLabel("Working hours").fill("1550");
    await hoursDialog.getByLabel("Note").fill("  diver shift log  ");
    await hoursDialog.getByRole("button", { name: "Save hours" }).click();

    expect(
      latestRequest(state, "PATCH", "/v1/asset/asset-1/working-hours").body,
    ).toMatchObject({
      working_hours: 1550,
      note: "  diver shift log  ",
    });
    await expect(hoursDialog).toHaveCount(0);
    await expect(page.getByText("Routine maintenance required")).toBeVisible();
    await expect(page.getByText("1,550 h")).toBeVisible();

    await page
      .getByRole("button", { name: "Complete maintenance" })
      .first()
      .click();
    const completeDialog = page.getByRole("dialog", {
      name: "Complete routine maintenance",
    });
    await completeDialog
      .getByLabel("Completion notes")
      .fill("Completed after inspection.");
    await completeDialog.getByRole("button", { name: "Complete" }).click();

    expect(
      latestRequest(
        state,
        "POST",
        "/v1/asset/asset-1/routine-maintenance/complete",
      ).body,
    ).toMatchObject({
      completion_notes: "Completed after inspection.",
    });
    await expect(completeDialog).toHaveCount(0);
    await expect(page.getByText("Routine maintenance completed")).toBeVisible();
    await expect(
      page.getByRole("row", { name: /RM-001 Completed/ }),
    ).toBeVisible();
    await expectNoUnexpectedApi(state);
  });

  test("ComponentFormPage preserves validation, form state, trimmed submit payload, and route ids", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(
      page,
      "/assets/asset-1/components/comp-1/edit",
    );

    await expect(
      page.getByRole("heading", { name: "Edit component" }),
    ).toBeVisible();
    await expect(
      page.getByText("Poseidon Lift Bag", { exact: true }),
    ).toBeVisible();

    await page.getByLabel("Component name").fill("");
    await page.getByRole("button", { name: "Save component" }).click();
    await expect(page.getByText("Component name is required.")).toBeVisible();
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "PUT" && request.path === "/v1/component/comp-1",
      ),
    ).toHaveLength(0);

    await page.getByLabel("Component name").fill("  Updated Harness  ");
    await page.getByLabel("Serial number").fill("SN-200");
    await page.getByLabel("Manufacturer").fill("  Updated Maker  ");
    await page.getByRole("button", { name: "Save component" }).click();

    const updateRequest = latestRequest(state, "PUT", "/v1/component/comp-1");
    expect(updateRequest.body).toMatchObject({
      asset_id: "asset-1",
      category_id: "cat-1",
      name: "Updated Harness",
      serial_number: "SN-200",
      manufacturer: "Updated Maker",
    });
    await expect(page).toHaveURL(/\/assets\/asset-1\?component=comp-1$/);
    await expectNoUnexpectedApi(state);
  });

  test("AssetFormPage preserves single-equipment validation, select IDs, payload trimming, and navigation", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(page, "/assets/new");

    await expect(
      page.getByRole("heading", { name: "Create asset" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create asset" }).click();
    await expect(page.getByText("Asset name is required.")).toBeVisible();
    expect(
      state.recorded.filter(
        (request) => request.method === "POST" && request.path === "/v1/asset",
      ),
    ).toHaveLength(0);

    await page.getByLabel("Asset name").fill("  Single Lift Bag  ");
    await page.getByLabel("Location").fill("  Deck B  ");
    await page.getByLabel("Maintenance interval (hours)").fill("750");
    await page.getByLabel("Description").fill("  Single equipment asset  ");
    await page
      .getByLabel("Photo URL")
      .fill("  https://example.test/photo.jpg  ");
    await page
      .getByLabel("Datasheet URL")
      .fill("  https://example.test/datasheet.pdf  ");
    await selectCloudscapeOption(
      page,
      "asset-kind-select",
      "Single-asset equipment",
    );
    await selectCloudscapeOption(
      page,
      "single-equipment-type-select",
      "Lift Bag Assembly",
    );
    await selectCloudscapeMultiOption(
      page,
      "single-equipment-test-types",
      "Annual Load Test",
    );

    await expect(
      page.getByText("Certificate slots", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Create asset" }).click();

    const createRequest = latestRequest(state, "POST", "/v1/asset");
    expect(createRequest.body).toMatchObject({
      name: "Single Lift Bag",
      asset_kind: "SINGLE_EQUIPMENT",
      template_id: null,
      location: "Deck B",
      description: "Single equipment asset",
      maintenance_interval_hours: 750,
      photo: "https://example.test/photo.jpg",
      datasheet: "https://example.test/datasheet.pdf",
      single_equipment: {
        equipment_type_id: "equipment-1",
        test_type_ids: ["test-1"],
      },
    });
    await expect(page).toHaveURL(/\/assets\/asset-created$/);
    await expectNoUnexpectedApi(state);
  });

  test("AssetFormPage preserves edit validation, locked mode fields, update payloads, and cancel route", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(page, "/assets/asset-1/edit");

    await expect(
      page.getByRole("heading", { name: "Edit asset" }),
    ).toBeVisible();
    await expect(
      page.getByText("Equipment type and certificate slots are managed", {
        exact: false,
      }),
    ).toHaveCount(0);
    await page.getByLabel("Maintenance interval (hours)").fill("-1");
    await page.getByRole("button", { name: "Save asset" }).click();
    await expect(
      page.getByText("Maintenance interval cannot be negative."),
    ).toBeVisible();
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "PUT" && request.path === "/v1/asset/asset-1",
      ),
    ).toHaveLength(0);

    await page.getByLabel("Asset name").fill("  Updated Lift Bag  ");
    await page.getByLabel("Location").fill("  Deck C  ");
    await page.getByLabel("Maintenance interval (hours)").fill("1800");
    await page.getByLabel("Description").fill("  Updated asset description  ");
    await page.getByRole("button", { name: "Save asset" }).click();

    const updateRequest = latestRequest(state, "PUT", "/v1/asset/asset-1");
    expect(updateRequest.body).toMatchObject({
      name: "Updated Lift Bag",
      asset_kind: "COMPONENTIZED",
      template_id: "tpl-1",
      location: "Deck C",
      description: "Updated asset description",
      maintenance_interval_hours: 1800,
    });
    expect(
      (updateRequest.body as { single_equipment?: unknown }).single_equipment,
    ).toBeUndefined();
    await expect(page).toHaveURL(/\/assets\/asset-1$/);
    await expect(page.getByText("Asset updated")).toBeVisible();
    await expectNoUnexpectedApi(state);
  });

  test("AssetWorkspacePage preserves component URL sync, grouping, download action, and admin routes", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(
      page,
      "/assets/asset-1?component=missing",
    );

    await expect(
      page.getByRole("heading", { name: "Poseidon Lift Bag" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/assets\/asset-1\?component=comp-1$/);
    await expect(
      page.getByRole("heading", { name: "Components" }),
    ).toBeVisible();
    await expect(
      page.getByText("Diving Systems", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Lifting/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Main Harness/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Main Harness" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Load Test Certificate/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "View file" }).click();
    latestRequest(state, "GET", "/v1/certificate/cert-1/file");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("lastWindowOpen")))
      .toBe("https://example.test/cert-1.pdf");

    await page.getByRole("button", { name: "Edit component" }).click();
    await expect(page).toHaveURL(
      /\/assets\/asset-1\/components\/comp-1\/edit$/,
    );
    await page.goto("/assets/asset-1?component=comp-1");
    await page.getByRole("button", { name: "Add certificate" }).click();
    await expect(page).toHaveURL(
      /\/assets\/asset-1\/components\/comp-1\/certificates\/new$/,
    );
    await expectNoUnexpectedApi(state);
  });

  test("AssetWorkspacePage preserves single-equipment workspace behavior and certificate download", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(page, "/assets/asset-single");

    await expect(
      page.getByRole("heading", { name: "Single Lift Bag" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Components" })).toHaveCount(
      0,
    );
    await expect(page.getByText("Lift Bag Assembly").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Equipment details" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Asset certificates" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit component" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("row", { name: /Single Equipment Certificate/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "View file" }).click();
    latestRequest(state, "GET", "/v1/certificate/cert-single/file");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("lastWindowOpen")))
      .toBe("https://example.test/cert-single.pdf");
    await expectNoUnexpectedApi(state);
  });

  test("ClientAccessPage preserves project and access modal actions with stale-row protection", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(page, "/client-access");

    await expect(
      page.getByRole("heading", { name: "Client access" }),
    ).toBeVisible();
    await expect(
      page.getByText("North Field", { exact: true }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Create project" }).click();
    const projectDialog = page.getByRole("dialog", { name: "Create project" });
    await projectDialog.getByLabel("Project name").fill("  South Field  ");
    await projectDialog.getByLabel("Description").fill("  South field work  ");
    await projectDialog.getByRole("button", { name: "Create project" }).click();

    expect(latestRequest(state, "POST", "/v1/project").body).toMatchObject({
      project_name: "South Field",
      description: "South field work",
      status: "ACTIVE",
    });
    await expect(projectDialog).toHaveCount(0);
    await expect(page.getByText("Project created")).toBeVisible();
    await expect(
      page.getByText("South Field", { exact: true }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Assign access" }).click();
    const accessDialog = page.getByRole("dialog", {
      name: "Assign client project access",
    });
    await expect(accessDialog).toBeVisible();
    await accessDialog.getByRole("button", { name: "Save access" }).click();
    expect(
      latestRequest(state, "POST", "/v1/user/user-client/project-access").body,
    ).toMatchObject({
      project_id: "project-1",
      status: "ACTIVE",
    });
    await expect(accessDialog).toHaveCount(0);
    await expect(page.getByText("Access saved")).toBeVisible();

    await page.getByRole("button", { name: "Suspend" }).first().click();
    expect(
      latestRequest(state, "PUT", "/v1/user-project-access/access-1").body,
    ).toMatchObject({
      project_id: "project-1",
      status: "SUSPENDED",
    });
    await expect(page.getByText("Access suspended")).toBeVisible();

    await page.getByRole("button", { name: "Remove" }).first().click();
    latestRequest(state, "DELETE", "/v1/user-project-access/access-1");
    await expect(page.getByText("Access removed")).toBeVisible();
    await expectNoUnexpectedApi(state);
  });

  test("CatalogPage preserves main category and category lifecycle flows", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(page, "/catalog");

    await expect(
      page.getByRole("heading", { name: "Catalog", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Diving Systems 1 Diving system assets/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Create main category" }).click();
    const mainCategoryDialog = page.getByRole("dialog", {
      name: "Create main category",
    });
    await mainCategoryDialog
      .getByRole("button", { name: "Create main category" })
      .click();
    await expect(
      mainCategoryDialog.getByText(
        "Main category name must be at least 2 characters.",
      ),
    ).toBeVisible();
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "POST" &&
          request.path === "/v1/catalog-scope/scope-1/main-category",
      ),
    ).toHaveLength(0);

    await mainCategoryDialog
      .getByLabel("Main category name")
      .fill("  Marine Systems  ");
    await mainCategoryDialog.getByLabel("Main category order").fill("2");
    await mainCategoryDialog
      .getByLabel("Description")
      .fill("  Marine catalog group  ");
    await mainCategoryDialog
      .getByRole("button", { name: "Create main category" })
      .click();

    expect(
      latestRequest(state, "POST", "/v1/catalog-scope/scope-1/main-category")
        .body,
    ).toMatchObject({
      sort_order: 2,
      main_category_name: "Marine Systems",
      description: "Marine catalog group",
    });
    await expect(mainCategoryDialog).toHaveCount(0);
    await expect(
      page.getByText("Main category created", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Marine Systems 2 Marine catalog group/ }),
    ).toBeVisible();

    await page
      .getByRole("row", { name: /Diving Systems 1 Diving system assets/ })
      .getByRole("button", { name: "Edit" })
      .click();
    const editMainDialog = page.getByRole("dialog", {
      name: "Edit main category",
    });
    await editMainDialog
      .getByLabel("Description")
      .fill("  Updated diving group  ");
    await editMainDialog.getByRole("button", { name: "Save changes" }).click();

    expect(
      latestRequest(
        state,
        "PUT",
        "/v1/catalog-scope-main-category/scope-main-1",
      ).body,
    ).toMatchObject({
      sort_order: 1,
      main_category_name: "Diving Systems",
      description: "Updated diving group",
    });
    await expect(editMainDialog).toHaveCount(0);
    await expect(
      page.getByText("Main category updated", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Create category" }).click();
    const categoryDialog = page.getByRole("dialog", {
      name: "Create category",
    });
    await categoryDialog
      .getByRole("button", { name: "Create category" })
      .click();
    await expect(
      categoryDialog.getByText("Category name must be at least 2 characters."),
    ).toBeVisible();
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "POST" &&
          request.path === "/v1/catalog-scope/scope-1/category",
      ),
    ).toHaveLength(0);

    await categoryDialog.getByLabel("Category name").fill("  Rigging  ");
    await categoryDialog.getByLabel("Category order").fill("2");
    await categoryDialog
      .getByLabel("Description")
      .fill("  Rigging components  ");
    await categoryDialog
      .getByRole("button", { name: "Create category" })
      .click();

    expect(
      latestRequest(state, "POST", "/v1/catalog-scope/scope-1/category").body,
    ).toMatchObject({
      main_category_id: "main-1",
      sort_order: 2,
      category_name: "Rigging",
      description: "Rigging components",
    });
    await expect(categoryDialog).toHaveCount(0);
    await expect(
      page.getByText("Category created", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", {
        name: /Rigging 1 2 Diving Systems Rigging components/,
      }),
    ).toBeVisible();

    await page
      .getByRole("row", {
        name: /Rigging 1 2 Diving Systems Rigging components/,
      })
      .getByRole("button", { name: "Delete" })
      .click();
    const deleteDialog = page.getByRole("dialog", {
      name: "Delete catalog entry",
    });
    await expect(deleteDialog.getByText("Rigging")).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(deleteDialog).toHaveCount(0);

    await page
      .getByRole("row", {
        name: /Rigging 1 2 Diving Systems Rigging components/,
      })
      .getByRole("button", { name: "Delete" })
      .click();
    await page
      .getByRole("dialog", { name: "Delete catalog entry" })
      .getByRole("button", { name: "Delete" })
      .click();
    latestRequest(state, "DELETE", "/v1/catalog-scope-category/scope-cat-2");
    await expect(
      page.getByText("Catalog entry deleted", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", {
        name: /Rigging 1 2 Diving Systems Rigging components/,
      }),
    ).toHaveCount(0);
    await expectNoUnexpectedApi(state);
  });

  test("CatalogPage preserves test type and equipment type lifecycle flows", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(page, "/catalog");

    await expect(
      page.getByRole("heading", { name: "Catalog", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Annual Load Test/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Create test type" }).click();
    const testDialog = page.getByRole("dialog", { name: "Create test type" });
    await testDialog.getByLabel("Validity duration (months)").fill("0");
    await testDialog.getByRole("button", { name: "Create test type" }).click();
    await expect(
      testDialog.getByText("Test type name must be at least 2 characters."),
    ).toBeVisible();
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "POST" && request.path === "/v1/test-type",
      ),
    ).toHaveLength(0);

    await testDialog.getByLabel("Test type name").fill("  Visual Inspection  ");
    await testDialog.getByLabel("Validity duration (months)").fill("18");
    await testDialog
      .getByLabel("Description")
      .fill("  Visual inspection cycle  ");
    await testDialog.getByRole("button", { name: "Create test type" }).click();

    expect(latestRequest(state, "POST", "/v1/test-type").body).toMatchObject({
      test_name: "Visual Inspection",
      validity_duration: 18,
      description: "Visual inspection cycle",
    });
    await expect(testDialog).toHaveCount(0);
    await expect(
      page.getByText("Test type created", { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("row", { name: /Annual Load Test/ })
      .getByRole("button", { name: "Edit" })
      .click();
    const editTestDialog = page.getByRole("dialog", { name: "Edit test type" });
    await editTestDialog.getByLabel("Validity duration (months)").fill("24");
    await editTestDialog.getByRole("button", { name: "Save changes" }).click();

    expect(
      latestRequest(state, "PUT", "/v1/test-type/test-1").body,
    ).toMatchObject({
      test_name: "Annual Load Test",
      validity_duration: 24,
      description: "Annual inspection",
    });
    await expect(editTestDialog).toHaveCount(0);
    await expect(
      page.getByText("Test type updated", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Create equipment type" }).click();
    const equipmentDialog = page.getByRole("dialog", {
      name: "Create equipment type",
    });
    await equipmentDialog
      .getByRole("button", { name: "Create equipment type" })
      .click();
    await expect(
      equipmentDialog.getByText(
        "Equipment type name must be at least 2 characters.",
      ),
    ).toBeVisible();
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "POST" && request.path === "/v1/equipment-type",
      ),
    ).toHaveLength(0);

    await equipmentDialog
      .getByLabel("Equipment type name")
      .fill("  Control Panel  ");
    await equipmentDialog.getByLabel("Equipment type order").fill("2");
    await equipmentDialog
      .getByLabel("Description")
      .fill("  Single equipment panel  ");
    await equipmentDialog
      .getByRole("button", { name: "Create equipment type" })
      .click();

    expect(
      latestRequest(state, "POST", "/v1/equipment-type").body,
    ).toMatchObject({
      equipment_type_name: "Control Panel",
      sort_order: 2,
      description: "Single equipment panel",
    });
    await expect(equipmentDialog).toHaveCount(0);
    await expect(
      page.getByText("Equipment type created", { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("row", { name: /Lift Bag Assembly/ })
      .getByRole("button", { name: "Edit" })
      .click();
    const editEquipmentDialog = page.getByRole("dialog", {
      name: "Edit equipment type",
    });
    await editEquipmentDialog
      .getByLabel("Description")
      .fill("  Updated equipment notes  ");
    await editEquipmentDialog
      .getByRole("button", { name: "Save changes" })
      .click();

    expect(
      latestRequest(state, "PUT", "/v1/equipment-type/equipment-1").body,
    ).toMatchObject({
      equipment_type_name: "Lift Bag Assembly",
      sort_order: 1,
      description: "Updated equipment notes",
    });
    await expect(editEquipmentDialog).toHaveCount(0);
    await expect(
      page.getByText("Equipment type updated", { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("row", { name: /Control Panel 2 Single equipment panel/ })
      .getByRole("button", { name: "Delete" })
      .click();
    await page
      .getByRole("dialog", { name: "Delete catalog entry" })
      .getByRole("button", { name: "Delete" })
      .click();
    latestRequest(state, "DELETE", "/v1/equipment-type/equipment-2");
    await expect(
      page.getByText("Catalog entry deleted", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Control Panel 2 Single equipment panel/ }),
    ).toHaveCount(0);
    await expectNoUnexpectedApi(state);
  });

  test("AdministrationPage preserves user create/edit/password/delete flows", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(page, "/administration");

    await expect(
      page.getByRole("heading", { name: "Administration" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Client Viewer/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Create user" }).click();
    const createDialog = page.getByRole("dialog", { name: "Create user" });
    await expect(createDialog).toBeVisible();
    await createDialog.getByRole("button", { name: "Create user" }).click();
    await expect(
      createDialog.getByText("Enter first name, last name, email, and role."),
    ).toBeVisible();
    expect(
      state.recorded.filter(
        (request) => request.method === "POST" && request.path === "/v1/user",
      ),
    ).toHaveLength(0);

    await createDialog.getByLabel("First name").fill("  Nora  ");
    await createDialog.getByLabel("Last name").fill("  Inspector  ");
    await createDialog.getByLabel("Email").fill("  nora@example.test  ");
    await createDialog.getByLabel("Temporary password").fill("secret1");
    await createDialog.getByRole("button", { name: "Create user" }).click();

    expect(latestRequest(state, "POST", "/v1/user").body).toMatchObject({
      first_name: "Nora",
      last_name: "Inspector",
      email: "nora@example.test",
      password: "secret1",
      role: "USER",
      status: "ACTIVE",
    });
    await expect(createDialog).toHaveCount(0);
    await expect(page.getByText("User created", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Nora Inspector/ }),
    ).toBeVisible();

    await page
      .getByRole("row", { name: /Client Viewer/ })
      .getByRole("button", { name: "Edit" })
      .click();
    const editDialog = page.getByRole("dialog", { name: "Edit user" });
    await editDialog.getByLabel("Last name").fill("  Updated  ");
    await editDialog.getByRole("button", { name: "Save changes" }).click();

    expect(
      latestRequest(state, "PUT", "/v1/user/user-client").body,
    ).toMatchObject({
      first_name: "Client",
      last_name: "Updated",
      email: "client@example.test",
      role: "CLIENT",
      status: "ACTIVE",
    });
    await expect(editDialog).toHaveCount(0);
    await expect(page.getByText("User updated", { exact: true })).toBeVisible();

    await page
      .getByRole("row", { name: /Client Updated/ })
      .getByRole("button", { name: "Change password" })
      .click();
    const passwordDialog = page.getByRole("dialog", {
      name: "Change user password",
    });
    await passwordDialog
      .getByLabel("New password", { exact: true })
      .fill("short");
    await passwordDialog.getByLabel("Confirm new password").fill("short");
    await passwordDialog
      .getByRole("button", { name: "Change password" })
      .click();
    await expect(
      passwordDialog.getByText("New password must be at least 6 characters."),
    ).toBeVisible();

    await passwordDialog
      .getByLabel("New password", { exact: true })
      .fill("secret2");
    await passwordDialog.getByLabel("Confirm new password").fill("secret3");
    await passwordDialog
      .getByRole("button", { name: "Change password" })
      .click();
    await expect(
      passwordDialog.getByText("Password confirmation does not match."),
    ).toBeVisible();

    await passwordDialog.getByLabel("Confirm new password").fill("secret2");
    await passwordDialog
      .getByRole("button", { name: "Change password" })
      .click();
    expect(
      latestRequest(state, "PUT", "/v1/user/user-client/password").body,
    ).toMatchObject({
      new_password: "secret2",
    });
    await expect(passwordDialog).toHaveCount(0);
    await expect(
      page.getByText("Password changed", { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("row", { name: /Client Updated/ })
      .getByRole("button", { name: "Delete" })
      .click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete user" });
    await expect(deleteDialog.getByText("Client Updated")).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(deleteDialog).toHaveCount(0);

    await page
      .getByRole("row", { name: /Client Updated/ })
      .getByRole("button", { name: "Delete" })
      .click();
    await page
      .getByRole("dialog", { name: "Delete user" })
      .getByRole("button", { name: "Delete" })
      .click();
    latestRequest(state, "DELETE", "/v1/user/user-client");
    await expect(page.getByText("User deleted", { exact: true })).toBeVisible();
    await expect(page.getByRole("row", { name: /Client Updated/ })).toHaveCount(
      0,
    );
    await expectNoUnexpectedApi(state);
  });

  test("AdministrationPage preserves competency category and competent person flows", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(page, "/administration");

    await expect(
      page.getByRole("heading", { name: "Competency Categories" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", {
        name: /Authorized Inspector Can renew certificates/,
      }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Create competency category" })
      .click();
    const categoryDialog = page.getByRole("dialog", {
      name: "Create competency category",
    });
    await categoryDialog
      .getByRole("button", { name: "Create category" })
      .click();
    await expect(
      categoryDialog.getByText("Enter a code and category name."),
    ).toBeVisible();
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "POST" &&
          request.path === "/v1/competency-category",
      ),
    ).toHaveLength(0);

    await categoryDialog.getByLabel("Code").fill("  QA  ");
    await categoryDialog.getByLabel("Name").fill("  Quality Authority  ");
    await categoryDialog
      .getByLabel("Description")
      .fill("  Can approve QA renewals.  ");
    await categoryDialog
      .getByRole("button", { name: "Create category" })
      .click();

    expect(
      latestRequest(state, "POST", "/v1/competency-category").body,
    ).toMatchObject({
      category_code: "QA",
      category_name: "Quality Authority",
      description: "Can approve QA renewals.",
      active: true,
    });
    await expect(categoryDialog).toHaveCount(0);
    await expect(
      page.getByText("Competency category created", { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("row", { name: /Authorized Inspector Can renew certificates/ })
      .getByRole("button", { name: "Edit" })
      .click();
    const editCategoryDialog = page.getByRole("dialog", {
      name: "Edit competency category",
    });
    await editCategoryDialog
      .getByLabel("Description")
      .fill("  Updated authority notes.  ");
    await editCategoryDialog
      .getByRole("button", { name: "Save changes" })
      .click();

    expect(
      latestRequest(state, "PUT", "/v1/competency-category/cc-1").body,
    ).toMatchObject({
      category_code: "AUTH",
      category_name: "Authorized Inspector",
      description: "Updated authority notes.",
      active: true,
    });
    await expect(editCategoryDialog).toHaveCount(0);
    await expect(
      page.getByText("Competency category updated", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Create competent person" }).click();
    const personDialog = page.getByRole("dialog", {
      name: "Create competent person",
    });
    await personDialog.getByRole("button", { name: "Create person" }).click();
    await expect(
      personDialog.getByText("Enter a name and choose a competency category."),
    ).toBeVisible();
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "POST" && request.path === "/v1/competent-person",
      ),
    ).toHaveLength(0);

    await personDialog.getByLabel("Full name").fill("  Riley Reviewer  ");
    await personDialog.getByLabel("Organization").fill("  Porto Marine  ");
    await personDialog.getByRole("button", { name: "Create person" }).click();

    expect(
      latestRequest(state, "POST", "/v1/competent-person").body,
    ).toMatchObject({
      full_name: "Riley Reviewer",
      person_type: "Internal",
      organization: "Porto Marine",
      competency_category_id: "cc-1",
      active: true,
    });
    await expect(personDialog).toHaveCount(0);
    await expect(
      page.getByText("Competent person created", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Riley Reviewer/ }),
    ).toBeVisible();

    await page
      .getByRole("row", { name: /Casey Competent/ })
      .getByRole("button", { name: "Edit" })
      .click();
    const editPersonDialog = page.getByRole("dialog", {
      name: "Edit competent person",
    });
    await editPersonDialog
      .getByLabel("Organization")
      .fill("  Updated Organization  ");
    await editPersonDialog
      .getByRole("button", { name: "Save changes" })
      .click();

    expect(
      latestRequest(state, "PUT", "/v1/competent-person/person-1").body,
    ).toMatchObject({
      full_name: "Casey Competent",
      person_type: "Internal",
      organization: "Updated Organization",
      competency_category_id: "cc-1",
      active: true,
    });
    await expect(editPersonDialog).toHaveCount(0);
    await expect(
      page.getByText("Competent person updated", { exact: true }),
    ).toBeVisible();
    await expectNoUnexpectedApi(state);
  });

  test("CertificateFormPage preserves create validation, expiry autofill, upload, and navigation", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(
      page,
      "/assets/asset-1/components/comp-1/certificates/new",
    );

    await expect(
      page.getByRole("heading", { name: "Create certificate" }),
    ).toBeVisible();
    await expect(
      page.getByText("Poseidon Lift Bag", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Main Harness", { exact: true })).toBeVisible();

    await page
      .getByRole("button", { name: "Create certificate" })
      .last()
      .click();
    await expect(page.getByText("Certificate name is required.")).toBeVisible();
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "POST" && request.path === "/v1/certificate",
      ),
    ).toHaveLength(0);

    await page.getByLabel("Certificate name").fill("  Created Certificate  ");
    await page
      .getByRole("button", { name: "Create certificate" })
      .last()
      .click();
    await expect(page.getByText("Choose a test type.")).toBeVisible();

    await selectOption(page, "Select a test type", "Annual Load Test");
    await page.getByLabel("Certificate issue date").fill("2026-03-15");
    await expect(page.getByLabel("Certificate expiry date")).toHaveValue(
      "2027-03-15",
    );
    await page.getByLabel("Issuing authority").fill("  Lloyds  ");
    await page.getByLabel("IMCA Ref").fill("  IMCA-CREATE  ");
    await page.getByLabel("IMCA D018").fill("  D018-CREATE  ");
    await page.getByLabel("Maintenance notes").fill("  Created notes.  ");

    await selectOption(page, "Select competent person", "Casey Competent");
    await page
      .getByRole("button", { name: "Create certificate" })
      .last()
      .click();
    await expect(
      page.getByText(
        "Choose a certificate file before selecting a competent person.",
      ),
    ).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "created-certificate.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\ncreated certificate\n"),
    });
    await expect(page.getByText("created-certificate.pdf")).toBeVisible();
    await page
      .getByRole("button", { name: "Create certificate" })
      .last()
      .click();

    expect(latestRequest(state, "POST", "/v1/certificate").body).toMatchObject({
      component_id: "comp-1",
      test_id: "test-1",
      certificate_name: "Created Certificate",
      issuing_authority: "Lloyds",
      issue_date: "2026-03-15T00:00:00.000Z",
      expiry_date: "2027-03-15T00:00:00.000Z",
      imca_ref: "IMCA-CREATE",
      imca_d018: "D018-CREATE",
      maintenance_notes: "Created notes.",
    });
    const uploadRequest = latestRequest(
      state,
      "POST",
      "/v1/certificate/cert-created/file",
    );
    expect(uploadRequest.contentType).toContain("multipart/form-data");
    expect(String(uploadRequest.body)).toContain("person-1");
    await expect(page).toHaveURL(
      /\/assets\/asset-1\/components\/comp-1\/certificates\/cert-created$/,
    );
    await expect(
      page.getByRole("heading", { name: "Created Certificate" }),
    ).toBeVisible();
    await expectNoUnexpectedApi(state);
  });

  test("CertificateFormPage rejects oversized certificate files before API submit", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(
      page,
      "/assets/asset-1/components/comp-1/certificates/new",
    );

    await page.getByLabel("Certificate name").fill("Oversized Certificate");
    await selectOption(page, "Select a test type", "Annual Load Test");
    await page.getByLabel("Certificate issue date").fill("2026-03-15");
    await selectOption(page, "Select competent person", "Casey Competent");

    await page.locator('input[type="file"]').setInputFiles({
      name: "oversized-certificate.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 65),
    });
    await expect(
      page.getByText("Certificate file must be 10 MB or smaller."),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Create certificate" })
      .last()
      .click();
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "POST" && request.path === "/v1/certificate",
      ),
    ).toHaveLength(0);
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "POST" && request.path.endsWith("/file"),
      ),
    ).toHaveLength(0);
    await expectNoUnexpectedApi(state);
  });

  test("CertificateFormPage preserves edit payload diff and hides create-only upload fields", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(
      page,
      "/assets/asset-1/components/comp-1/certificates/cert-1/edit",
    );

    await expect(
      page.getByRole("heading", { name: "Edit certificate" }),
    ).toBeVisible();
    await expect(page.getByLabel("Certificate issue date")).toHaveCount(0);
    await expect(
      page.getByText("Certificate file", { exact: true }),
    ).toHaveCount(0);

    await page.getByLabel("Certificate name").fill("  Updated Certificate  ");
    await selectOption(page, "Annual Load Test", "NDT Inspection");
    await page.getByLabel("Issuing authority").fill("  ABS  ");
    await page.getByLabel("IMCA Ref").fill("  IMCA-EDIT  ");
    await page.getByLabel("IMCA D018").fill("  D018-EDIT  ");
    await page.getByLabel("Maintenance notes").fill("  Edited notes.  ");
    await page.getByRole("button", { name: "Save certificate" }).last().click();

    const updateRequest = latestRequest(
      state,
      "PATCH",
      "/v1/certificate/cert-1",
    );
    expect(updateRequest.body).toMatchObject({
      certificate_name: "Updated Certificate",
      issuing_authority: "ABS",
      test_id: "test-2",
      imca_ref: "IMCA-EDIT",
      imca_d018: "D018-EDIT",
      maintenance_notes: "Edited notes.",
    });
    expect(updateRequest.body).not.toHaveProperty("issue_date");
    expect(updateRequest.body).not.toHaveProperty("expiry_date");
    await expect(page).toHaveURL(
      /\/assets\/asset-1\/components\/comp-1\/certificates\/cert-1$/,
    );
    await expect(
      page.getByRole("heading", { name: "Updated Certificate" }),
    ).toBeVisible();
    await expectNoUnexpectedApi(state);
  });

  test("CertificateDetailPage rejects oversized renewal files before upload", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(
      page,
      "/assets/asset-1/components/comp-1/certificates/cert-1",
    );

    await page.getByLabel("Certificate renewal issue date").fill("2026-02-01");
    await page.getByLabel("Certificate renewal file").setInputFiles({
      name: "oversized-renewal.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 65),
    });

    await expect(page.getByText("File too large")).toBeVisible();
    await expect(
      page.getByText("Certificate file must be 10 MB or smaller."),
    ).toBeVisible();
    await expect(page.getByText("oversized-renewal.pdf")).toHaveCount(0);
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "PATCH" &&
          request.path === "/v1/certificate/cert-1",
      ),
    ).toHaveLength(0);
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "POST" &&
          request.path === "/v1/certificate/cert-1/file",
      ),
    ).toHaveLength(0);
    await expectNoUnexpectedApi(state);
  });

  test("CertificateDetailPage shows friendly upload error for upstream 413 HTML", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(
      page,
      "/assets/asset-1/components/comp-1/certificates/cert-1",
    );
    state.failNextCertificateUploadWithHtml413 = true;

    await page.getByLabel("Certificate renewal issue date").fill("2026-02-01");
    await page.getByLabel("Certificate renewal file").setInputFiles({
      name: "proxy-rejected-certificate.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nproxy rejected certificate\n"),
    });
    await selectOption(page, "Select competent person", "Casey Competent");
    await page
      .getByRole("button", { name: "Renew/change certificate" })
      .click();

    await expect(page.getByText("Upload failed")).toBeVisible();
    await expect(
      page.getByText("Certificate file must be 10 MB or smaller."),
    ).toBeVisible();
    await expect(page.getByText("413 Request Entity Too Large")).toHaveCount(0);
    await expect(page.getByText("nginx/1.30.0")).toHaveCount(0);
    latestRequest(state, "POST", "/v1/certificate/cert-1/file");
    expect(
      state.recorded.filter(
        (request) =>
          request.method === "PATCH" &&
          request.path === "/v1/certificate/cert-1",
      ),
    ).toHaveLength(0);
    await expectNoUnexpectedApi(state);
  });

  test("CertificateDetailPage preserves route ids, renewal file/date flow, and upload actions", async ({
    page,
  }) => {
    const state = await bootMockedAdmin(
      page,
      "/assets/asset-1/components/comp-1/certificates/cert-1",
    );

    await expect(
      page.getByRole("heading", { name: "Load Test Certificate" }),
    ).toBeVisible();
    await expect(
      page.getByText("Poseidon Lift Bag", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Main Harness")).toBeVisible();

    await page.getByRole("button", { name: "Download file" }).click();
    latestRequest(state, "GET", "/v1/certificate/cert-1/file");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("lastWindowOpen")))
      .toBe("https://example.test/cert-1.pdf");

    await page.getByRole("button", { name: "Edit certificate" }).click();
    await expect(page).toHaveURL(
      /\/assets\/asset-1\/components\/comp-1\/certificates\/cert-1\/edit$/,
    );
    await page.goto("/assets/asset-1/components/comp-1/certificates/cert-1");

    await page.getByLabel("Certificate renewal issue date").fill("2026-02-01");
    await expect(
      page.getByLabel("Certificate renewal expiry date"),
    ).toHaveValue("2027-02-01");
    await page.getByLabel("Certificate renewal file").setInputFiles({
      name: "renewed-certificate.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nmock certificate\n"),
    });
    await expect(page.getByText("renewed-certificate.pdf")).toBeVisible();

    await selectOption(page, "Select competent person", "Casey Competent");
    await expect(
      page.getByText("Authorized Inspector: Can renew certificates."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Renew/change certificate" })
      .click();

    const uploadRequest = latestRequest(
      state,
      "POST",
      "/v1/certificate/cert-1/file",
    );
    expect(uploadRequest.contentType).toContain("multipart/form-data");
    expect(String(uploadRequest.body)).toContain("person-1");
    expect(
      latestRequest(state, "PATCH", "/v1/certificate/cert-1").body,
    ).toMatchObject({
      issue_date: "2026-02-01T00:00:00.000Z",
      expiry_date: "2027-02-01T00:00:00.000Z",
    });
    await expect(page.getByText("Certificate renewed")).toBeVisible();
    await expect(page.getByText("renewed-certificate.pdf")).toHaveCount(0);

    await page.getByRole("button", { name: "View" }).first().click();
    latestRequest(state, "GET", "/v1/certificate/cert-1/uploads/upload-2/file");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("lastWindowOpen")))
      .toBe("https://example.test/upload-2.pdf");
    await expectNoUnexpectedApi(state);
  });
});
