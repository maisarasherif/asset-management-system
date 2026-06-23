import type {
  Asset,
  AssetDashboardData,
  AssetInput,
  AssetMaintenanceEvent,
  AssetMaintenanceUpdateResponse,
  AssetWorkingHoursInput,
  AssetTemplateInput,
  AdminUpdateUserPasswordInput,
  AssetTemplate,
  CatalogScope,
  CatalogScopeInput,
  CatalogScopeCategory,
  CatalogScopeCategoryInput,
  CatalogScopeMainCategory,
  CatalogScopeMainCategoryInput,
  CategoryInput,
  Category,
  Certificate,
  CertificateInput,
  CertificateNotificationFailure,
  CertificateNotificationTask,
  CertificateUploadAudit,
  CertificateWithContext,
  ClientAssetDetail,
  CompetencyCategory,
  CompetencyCategoryInput,
	  CompetentPerson,
	  CompetentPersonInput,
	  EquipmentType,
	  EquipmentTypeInput,
	  PatchCertificateInput,
  ConfigureTemplateInput,
  ComponentInput,
  CompleteAssetMaintenanceInput,
  CreateUserInput,
  Project,
  ProjectInput,
  MainCategoryInput,
  ComponentRecord,
  ForgotPasswordInput,
  HRAdminPerson,
  HRAdminPersonInput,
  HRAdminVehicle,
  HRAdminVehicleInput,
  LoginResponse,
  MainCategory,
  MessageResponse,
  PaginatedResponse,
  PlatformProductsResponse,
  TemplateConfigurationComponent,
  TemplateComponent,
  TemplateComponentInput,
  TemplateComponentTest,
	  TestTypeInput,
	  TestType,
  SingleAssetEquipment,
  SchedulerRunResponse,
  ResetPasswordInput,
  UpdatePasswordInput,
  UpdateUserInput,
  UserAccount,
  UserManagementAuditLog,
  UserProjectAccess,
  UserProjectAccessInput,
} from "../../types/ams";
import { countCertificateStatuses } from "../../utils/certificateStatusCounts";
import { apiRequest } from "./client";

interface LoginPayload {
  email: string;
  password: string;
}

function normalizeCollection<T>(data: T[] | null | undefined): T[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter((item): item is T => item != null);
}

type TemplateConfigurationComponentApi = Omit<TemplateConfigurationComponent, "tests"> & {
  tests?: TemplateConfigurationComponent["tests"] | null;
};

async function fetchAllPages<T>(
  loader: (page: number) => Promise<PaginatedResponse<T>>
): Promise<T[]> {
  const firstPage = await loader(1);
  const pages = Array.from(
    { length: Math.max(firstPage.meta.total_pages - 1, 0) },
    (_, index) => index + 2
  );
  const remaining = await Promise.all(pages.map((page) => loader(page)));
  return [firstPage, ...remaining].flatMap((page) => normalizeCollection(page.data));
}

export function login(payload: LoginPayload) {
	return apiRequest<LoginResponse>(
    "/v1/login",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    { auth: false }
	);
}

export function getSession() {
	return apiRequest<LoginResponse>("/v1/session");
}

export function logoutRequest() {
	return apiRequest<MessageResponse>("/v1/logout", { method: "POST" });
}

export function listPlatformProducts() {
  return apiRequest<PlatformProductsResponse>("/v1/platform/products");
}

export function forgotPassword(payload: ForgotPasswordInput) {
  return apiRequest<MessageResponse>(
    "/v1/forgot-password",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    { auth: false }
  );
}

export function resetPassword(payload: ResetPasswordInput) {
  return apiRequest<MessageResponse>(
    "/v1/reset-password",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    { auth: false }
  );
}

export function updatePassword(payload: UpdatePasswordInput) {
  return apiRequest<MessageResponse>("/v1/account/password", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function listHRAdminPersons(page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<HRAdminPerson>>(`/v1/hr-admin/persons?page=${page}&limit=${limit}`);
}

export function createHRAdminPerson(payload: HRAdminPersonInput) {
  return apiRequest<HRAdminPerson>("/v1/hr-admin/persons", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateHRAdminPerson(personId: string, payload: HRAdminPersonInput) {
  return apiRequest<MessageResponse>(`/v1/hr-admin/persons/${personId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function archiveHRAdminPerson(personId: string, archiveReason: string) {
  return apiRequest<MessageResponse>(`/v1/hr-admin/persons/${personId}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archive_reason: archiveReason }),
  });
}

export function listHRAdminVehicles(page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<HRAdminVehicle>>(`/v1/hr-admin/vehicles?page=${page}&limit=${limit}`);
}

export function createHRAdminVehicle(payload: HRAdminVehicleInput) {
  return apiRequest<HRAdminVehicle>("/v1/hr-admin/vehicles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateHRAdminVehicle(vehicleId: string, payload: HRAdminVehicleInput) {
  return apiRequest<MessageResponse>(`/v1/hr-admin/vehicles/${vehicleId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function archiveHRAdminVehicle(vehicleId: string, archiveReason: string) {
  return apiRequest<MessageResponse>(`/v1/hr-admin/vehicles/${vehicleId}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archive_reason: archiveReason }),
  });
}

export function createUser(payload: CreateUserInput) {
  return apiRequest<UserAccount>("/v1/user", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listProjects() {
  return apiRequest<Project[]>("/v1/projects");
}

export function createProject(payload: ProjectInput) {
  return apiRequest<Project>("/v1/project", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProject(projectId: string, payload: ProjectInput) {
  return apiRequest<MessageResponse>(`/v1/project/${projectId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function listUserProjectAccess() {
  return apiRequest<UserProjectAccess[]>("/v1/user-project-access");
}

export function upsertUserProjectAccess(userId: string, payload: UserProjectAccessInput) {
  return apiRequest<UserProjectAccess>(`/v1/user/${userId}/project-access`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUserProjectAccess(accessId: string, payload: UserProjectAccessInput) {
  return apiRequest<MessageResponse>(`/v1/user-project-access/${accessId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteUserProjectAccess(accessId: string) {
  return apiRequest<MessageResponse>(`/v1/user-project-access/${accessId}`, {
    method: "DELETE",
  });
}

export function listUsers(page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<UserAccount>>(`/v1/users?page=${page}&limit=${limit}`);
}

export function listAllUsers() {
  return fetchAllPages((page) => listUsers(page));
}

export function updateUser(userId: string, payload: UpdateUserInput) {
  return apiRequest<MessageResponse>(`/v1/user/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function updateUserPassword(userId: string, payload: AdminUpdateUserPasswordInput) {
  return apiRequest<MessageResponse>(`/v1/user/${userId}/password`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteUser(userId: string) {
  return apiRequest<MessageResponse>(`/v1/user/${userId}`, {
    method: "DELETE",
  });
}

export function listUserManagementAuditLogs(page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<UserManagementAuditLog>>(
    `/v1/user-management-audit-logs?page=${page}&limit=${limit}`
  );
}

export function listAllUserManagementAuditLogs() {
  return fetchAllPages((page) => listUserManagementAuditLogs(page));
}

export function listCompetencyCategories(page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<CompetencyCategory>>(
    `/v1/competency-categories?page=${page}&limit=${limit}`
  );
}

export function listAllCompetencyCategories() {
  return fetchAllPages((page) => listCompetencyCategories(page));
}

export function listActiveCompetencyCategories() {
  return apiRequest<CompetencyCategory[]>("/v1/competency-categories/active");
}

export function createCompetencyCategory(payload: CompetencyCategoryInput) {
  return apiRequest<CompetencyCategory>("/v1/competency-category", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCompetencyCategory(
  competencyCategoryId: string,
  payload: CompetencyCategoryInput
) {
  return apiRequest<MessageResponse>(`/v1/competency-category/${competencyCategoryId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function listCompetentPersons(page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<CompetentPerson>>(
    `/v1/competent-persons?page=${page}&limit=${limit}`
  );
}

export function listAllCompetentPersons() {
  return fetchAllPages((page) => listCompetentPersons(page));
}

export function listActiveCompetentPersons() {
  return apiRequest<CompetentPerson[]>("/v1/competent-persons/active");
}

export function createCompetentPerson(payload: CompetentPersonInput) {
  return apiRequest<CompetentPerson>("/v1/competent-person", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCompetentPerson(competentPersonId: string, payload: CompetentPersonInput) {
  return apiRequest<MessageResponse>(`/v1/competent-person/${competentPersonId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function listAssets(page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<Asset>>(`/v1/assets?page=${page}&limit=${limit}`);
}

export function listAllAssets() {
  return fetchAllPages((page) => listAssets(page));
}

export function listClientAssets(page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<Asset>>(`/v1/client/assets?page=${page}&limit=${limit}`);
}

export function listAllClientAssets() {
  return fetchAllPages((page) => listClientAssets(page));
}

export function getClientAsset(assetId: string) {
  return apiRequest<ClientAssetDetail>(`/v1/client/asset/${assetId}`);
}

export function getClientCertificateDownloadUrl(certificateId: string) {
  return apiRequest<{ url: string }>(`/v1/client/certificate/${certificateId}/file`);
}

export function getAsset(assetId: string) {
  return apiRequest<Asset>(`/v1/asset/${assetId}`);
}

export function getAssetComponentCertificateSheet(assetId: string) {
  return apiRequest<Blob>(
    `/v1/asset/${assetId}/component-certificate-sheet`,
    {},
    { responseMode: "blob" }
  );
}

export function createAsset(payload: AssetInput) {
  return apiRequest<Asset>("/v1/asset", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAsset(assetId: string, payload: AssetInput) {
  return apiRequest<MessageResponse>(`/v1/asset/${assetId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteAsset(assetId: string) {
  return apiRequest<MessageResponse>(`/v1/asset/${assetId}`, {
    method: "DELETE",
  });
}

export function updateAssetWorkingHours(assetId: string, payload: AssetWorkingHoursInput) {
  return apiRequest<AssetMaintenanceUpdateResponse>(`/v1/asset/${assetId}/working-hours`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function listAssetRoutineMaintenance(assetId: string) {
  return apiRequest<AssetMaintenanceEvent[]>(`/v1/asset/${assetId}/routine-maintenance`);
}

export function completeAssetRoutineMaintenance(
  assetId: string,
  payload: CompleteAssetMaintenanceInput
) {
  return apiRequest<AssetMaintenanceUpdateResponse>(
    `/v1/asset/${assetId}/routine-maintenance/complete`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function getSingleAssetEquipment(assetId: string) {
  return apiRequest<SingleAssetEquipment>(`/v1/asset/${assetId}/single-equipment`);
}

export function listComponentsByAsset(assetId: string, page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<ComponentRecord>>(
    `/v1/components/asset/${assetId}?page=${page}&limit=${limit}`
  );
}

export function listAllComponentsByAsset(assetId: string) {
  return fetchAllPages((page) => listComponentsByAsset(assetId, page));
}

export function getComponent(componentId: string) {
  return apiRequest<ComponentRecord>(`/v1/component/${componentId}`);
}

export function createComponent(payload: ComponentInput) {
  return apiRequest<ComponentRecord>("/v1/component", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateComponent(componentId: string, payload: ComponentInput) {
  return apiRequest<MessageResponse>(`/v1/component/${componentId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function listCategories(page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<Category>>(
    `/v1/categories?page=${page}&limit=${limit}`
  );
}

export function listAllCategories() {
  return fetchAllPages((page) => listCategories(page));
}

export function createCategory(payload: CategoryInput) {
  return apiRequest<Category>("/v1/category", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCategory(categoryId: string, payload: CategoryInput) {
  return apiRequest<MessageResponse>(`/v1/category/${categoryId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteCategory(categoryId: string) {
  return apiRequest<MessageResponse>(`/v1/category/${categoryId}`, {
    method: "DELETE",
  });
}

export function listMainCategories(page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<MainCategory>>(
    `/v1/main-categories?page=${page}&limit=${limit}`
  );
}

export function listAllMainCategories() {
  return fetchAllPages((page) => listMainCategories(page));
}

export function listCatalogScopes() {
  return apiRequest<CatalogScope[]>("/v1/catalog-scopes");
}

export function getDefaultCatalogScope() {
  return apiRequest<CatalogScope>("/v1/catalog-scopes/default");
}

export function createCatalogScope(payload: CatalogScopeInput) {
  return apiRequest<CatalogScope>("/v1/catalog-scope", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCatalogScope(scopeId: string, payload: CatalogScopeInput) {
  return apiRequest<MessageResponse>(`/v1/catalog-scope/${scopeId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function duplicateCatalogScope(scopeId: string, payload: CatalogScopeInput) {
  return apiRequest<CatalogScope>(`/v1/catalog-scope/${scopeId}/duplicate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteCatalogScope(scopeId: string) {
  return apiRequest<MessageResponse>(`/v1/catalog-scope/${scopeId}`, {
    method: "DELETE",
  });
}

export function listCatalogScopeMainCategories(scopeId: string, page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<CatalogScopeMainCategory>>(
    `/v1/catalog-scope/${scopeId}/main-categories?page=${page}&limit=${limit}`
  );
}

export function listAllCatalogScopeMainCategories(scopeId: string) {
  return fetchAllPages((page) => listCatalogScopeMainCategories(scopeId, page));
}

export function createCatalogScopeMainCategory(
  scopeId: string,
  payload: CatalogScopeMainCategoryInput
) {
  return apiRequest<CatalogScopeMainCategory>(`/v1/catalog-scope/${scopeId}/main-category`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCatalogScopeMainCategory(
  scopeMainCategoryId: string,
  payload: CatalogScopeMainCategoryInput
) {
  return apiRequest<MessageResponse>(`/v1/catalog-scope-main-category/${scopeMainCategoryId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteCatalogScopeMainCategory(scopeMainCategoryId: string) {
  return apiRequest<MessageResponse>(`/v1/catalog-scope-main-category/${scopeMainCategoryId}`, {
    method: "DELETE",
  });
}

export function listCatalogScopeCategories(scopeId: string, page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<CatalogScopeCategory>>(
    `/v1/catalog-scope/${scopeId}/categories?page=${page}&limit=${limit}`
  );
}

export function listAllCatalogScopeCategories(scopeId: string) {
  return fetchAllPages((page) => listCatalogScopeCategories(scopeId, page));
}

export function createCatalogScopeCategory(scopeId: string, payload: CatalogScopeCategoryInput) {
  return apiRequest<CatalogScopeCategory>(`/v1/catalog-scope/${scopeId}/category`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCatalogScopeCategory(
  scopeCategoryId: string,
  payload: CatalogScopeCategoryInput
) {
  return apiRequest<MessageResponse>(`/v1/catalog-scope-category/${scopeCategoryId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteCatalogScopeCategory(scopeCategoryId: string) {
  return apiRequest<MessageResponse>(`/v1/catalog-scope-category/${scopeCategoryId}`, {
    method: "DELETE",
  });
}

export function createMainCategory(payload: MainCategoryInput) {
  return apiRequest<MainCategory>("/v1/main-category", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMainCategory(
  mainCategoryId: string,
  payload: MainCategoryInput
) {
  return apiRequest<MessageResponse>(`/v1/main-category/${mainCategoryId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteMainCategory(mainCategoryId: string) {
  return apiRequest<MessageResponse>(`/v1/main-category/${mainCategoryId}`, {
    method: "DELETE",
  });
}

export function listTestTypes() {
  return apiRequest<TestType[]>("/v1/test-types");
}

export function createTestType(payload: TestTypeInput) {
  return apiRequest<TestType>("/v1/test-type", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTestType(testId: string, payload: TestTypeInput) {
  return apiRequest<MessageResponse>(`/v1/test-type/${testId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteTestType(testId: string) {
  return apiRequest<MessageResponse>(`/v1/test-type/${testId}`, {
    method: "DELETE",
  });
}

export function listEquipmentTypes(page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<EquipmentType>>(
    `/v1/equipment-types?page=${page}&limit=${limit}`
  );
}

export function listAllEquipmentTypes() {
  return fetchAllPages((page) => listEquipmentTypes(page));
}

export function createEquipmentType(payload: EquipmentTypeInput) {
  return apiRequest<EquipmentType>("/v1/equipment-type", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEquipmentType(equipmentTypeId: string, payload: EquipmentTypeInput) {
  return apiRequest<MessageResponse>(`/v1/equipment-type/${equipmentTypeId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteEquipmentType(equipmentTypeId: string) {
  return apiRequest<MessageResponse>(`/v1/equipment-type/${equipmentTypeId}`, {
    method: "DELETE",
  });
}

export function listTemplates() {
  return apiRequest<AssetTemplate[]>("/v1/templates");
}

export function getTemplate(templateId: string) {
  return apiRequest<AssetTemplate>(`/v1/template/${templateId}`);
}

export function createTemplate(payload: AssetTemplateInput) {
  return apiRequest<AssetTemplate>("/v1/template", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTemplate(templateId: string, payload: AssetTemplateInput) {
  return apiRequest<MessageResponse>(`/v1/template/${templateId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteTemplate(templateId: string) {
  return apiRequest<MessageResponse>(`/v1/template/${templateId}`, {
    method: "DELETE",
  });
}

export function configureTemplate(templateId: string, payload: ConfigureTemplateInput) {
  return apiRequest<MessageResponse>(`/v1/template/${templateId}/configuration`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function listTemplateComponents(templateId: string) {
  return apiRequest<TemplateComponent[]>(`/v1/template/${templateId}/components`);
}

export function createTemplateComponent(templateId: string, payload: TemplateComponentInput) {
  return apiRequest<TemplateComponent>(`/v1/template/${templateId}/component`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTemplateComponent(
  templateComponentId: string,
  payload: TemplateComponentInput
) {
  return apiRequest<MessageResponse>(`/v1/template-component/${templateComponentId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteTemplateComponent(templateComponentId: string) {
  return apiRequest<MessageResponse>(`/v1/template-component/${templateComponentId}`, {
    method: "DELETE",
  });
}

export function listTemplateComponentTests(templateComponentId: string) {
  return apiRequest<TemplateComponentTest[]>(
    `/v1/template-component/${templateComponentId}/tests`
  );
}

export function addTemplateComponentTest(
  templateComponentId: string,
  testId: string,
  competencyCategoryIds: string[] = []
) {
  return apiRequest<TemplateComponentTest>(`/v1/template-component/${templateComponentId}/test`, {
    method: "POST",
    body: JSON.stringify({ test_id: testId, competency_category_ids: competencyCategoryIds }),
  });
}

export function deleteTemplateComponentTest(templateComponentTestId: string) {
  return apiRequest<MessageResponse>(`/v1/template-component-test/${templateComponentTestId}`, {
    method: "DELETE",
  });
}

export async function getTemplateConfiguration(
  templateId: string
): Promise<TemplateConfigurationComponent[]> {
  const components = normalizeCollection(
    await apiRequest<TemplateConfigurationComponentApi[]>(`/v1/template/${templateId}/configuration`)
  );

  return components.map((component) => ({
    ...component,
    tests: component.tests ?? [],
  }));
}

export async function getTemplatePreview(templateId: string) {
  const components = await getTemplateConfiguration(templateId);

  return {
    components,
    totalComponents: components.length,
    totalTests: components.reduce((count, component) => count + (component.tests ?? []).length, 0),
    testsByComponent: components.map((component) => ({
      componentId: component.template_component_id,
      count: (component.tests ?? []).length,
    })),
  };
}

export function listCertificatesByComponent(
  componentId: string,
  page = 1,
  limit = 100
) {
  return apiRequest<PaginatedResponse<Certificate>>(
    `/v1/certificates/component/${componentId}?page=${page}&limit=${limit}`
  );
}

export function listAllCertificatesByComponent(componentId: string) {
  return fetchAllPages((page) => listCertificatesByComponent(componentId, page));
}

export function listCertificatesWithContext(page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<CertificateWithContext>>(
    `/v1/certificates/dashboard?page=${page}&limit=${limit}`
  );
}

export function listAllCertificatesWithContext() {
  return fetchAllPages((page) => listCertificatesWithContext(page));
}

export function listCertificateNotificationTasks(page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<CertificateNotificationTask>>(
    `/v1/scheduler/certificate-notifications?page=${page}&limit=${limit}`
  );
}

export function listAllCertificateNotificationTasks() {
  return fetchAllPages((page) => listCertificateNotificationTasks(page));
}

export function listCertificateNotificationFailures(page = 1, limit = 100) {
  return apiRequest<PaginatedResponse<CertificateNotificationFailure>>(
    `/v1/scheduler/notification-failures?page=${page}&limit=${limit}`
  );
}

export function listAllCertificateNotificationFailures() {
  return fetchAllPages((page) => listCertificateNotificationFailures(page));
}

export function runCertificateExpiryScheduler() {
  return apiRequest<SchedulerRunResponse>("/v1/scheduler/run", {
    method: "POST",
  });
}

export function getCertificate(certificateId: string) {
  return apiRequest<Certificate>(`/v1/certificate/${certificateId}`);
}

export function createCertificate(payload: CertificateInput) {
  return apiRequest<Certificate>("/v1/certificate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCertificate(certificateId: string, payload: CertificateInput) {
  return apiRequest<MessageResponse>(`/v1/certificate/${certificateId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function patchCertificate(certificateId: string, payload: PatchCertificateInput) {
  return apiRequest<MessageResponse>(`/v1/certificate/${certificateId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function uploadCertificateFile(
  certificateId: string,
  file: File,
  competentPersonId: string
) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("competent_person_id", competentPersonId);

  return apiRequest<MessageResponse>(
    `/v1/certificate/${certificateId}/file`,
    {
      method: "POST",
      body: formData,
    }
  );
}

export function getCertificateDownloadUrl(certificateId: string) {
  return apiRequest<{ url: string }>(`/v1/certificate/${certificateId}/file`);
}

export function listCertificateUploads(certificateId: string, page = 1, limit = 20) {
  return apiRequest<PaginatedResponse<CertificateUploadAudit>>(
    `/v1/certificate/${certificateId}/uploads?page=${page}&limit=${limit}`
  );
}

export function getCertificateUploadDownloadUrl(certificateId: string, uploadId: string) {
  return apiRequest<{ url: string }>(
    `/v1/certificate/${certificateId}/uploads/${uploadId}/file`
  );
}

export async function getAssetDashboard(assetId: string): Promise<AssetDashboardData> {
  const [asset, components] = await Promise.all([
    getAsset(assetId),
    listAllComponentsByAsset(assetId),
  ]);

  const certificates = await Promise.all(
    components.map(async (component) => {
      const componentCertificates = await listAllCertificatesByComponent(component.component_id);
      return componentCertificates.map((certificate) => ({
        ...certificate,
        component_name: component.name,
      }));
    })
  );

  const flatCertificates = certificates.flat();

  const statusCounts = countCertificateStatuses(flatCertificates);

  const byExpiryDate = [...flatCertificates].sort((left, right) => {
    if (!left.expiry_date) return 1;
    if (!right.expiry_date) return -1;
    return new Date(left.expiry_date).getTime() - new Date(right.expiry_date).getTime();
  });

  return {
    asset,
    components,
    certificates: flatCertificates,
    statusCounts,
    urgentCertificates: byExpiryDate.filter((certificate) =>
      ["EXPIRED", "EXPIRING_SOON"].includes(certificate.status)
    ),
    latestCertificates: byExpiryDate,
  };
}
