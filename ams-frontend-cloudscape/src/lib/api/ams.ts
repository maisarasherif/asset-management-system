import type {
  Asset,
  AssetDashboardData,
  AssetInput,
  AssetTemplateInput,
  AssetTemplate,
  CategoryInput,
  Category,
  Certificate,
  CertificateInput,
  CertificateUploadAudit,
  PatchCertificateInput,
  ConfigureTemplateInput,
  ComponentInput,
  MainCategoryInput,
  ComponentRecord,
  LoginResponse,
  MainCategory,
  MessageResponse,
  PaginatedResponse,
  TemplateConfigurationComponent,
  TemplateComponent,
  TemplateComponentInput,
  TemplateComponentTest,
  TestTypeInput,
  TestType,
  UpdatePasswordInput,
} from "../../types/ams";
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

export function logoutRequest() {
  return apiRequest<MessageResponse>("/v1/logout", { method: "POST" });
}

export function updatePassword(payload: UpdatePasswordInput) {
  return apiRequest<MessageResponse>("/v1/account/password", {
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

export function getAsset(assetId: string) {
  return apiRequest<Asset>(`/v1/asset/${assetId}`);
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

export function addTemplateComponentTest(templateComponentId: string, testId: string) {
  return apiRequest<TemplateComponentTest>(`/v1/template-component/${templateComponentId}/test`, {
    method: "POST",
    body: JSON.stringify({ test_id: testId }),
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
  return normalizeCollection(
    await apiRequest<TemplateConfigurationComponent[]>(`/v1/template/${templateId}/configuration`)
  );
}

export async function getTemplatePreview(templateId: string) {
  const components = await getTemplateConfiguration(templateId);

  return {
    components,
    totalComponents: components.length,
    totalTests: components.reduce((count, component) => count + component.tests.length, 0),
    testsByComponent: components.map((component) => ({
      componentId: component.template_component_id,
      count: component.tests.length,
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

export function uploadCertificateFile(certificateId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

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

  const statusCounts = flatCertificates.reduce(
    (counts, certificate) => {
      switch (certificate.status) {
        case "EXPIRED":
          counts.expired += 1;
          break;
        case "EXPIRING_SOON":
          counts.expiringSoon += 1;
          break;
        case "VALID":
          counts.valid += 1;
          break;
        default:
          counts.pending += 1;
          break;
      }
      return counts;
    },
    {
      expired: 0,
      expiringSoon: 0,
      valid: 0,
      pending: 0,
    }
  );

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
