export type Role = "ADMIN" | "USER";
export type AssetStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE";
export type CertificateStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "PENDING";
export type SafetyCritical = "YES" | "NO";

export interface AuthSession {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  token: string;
}

export interface LoginResponse {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: Role;
  token: string;
  refresh_token?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface MessageResponse {
  message: string;
}

export interface Asset {
  asset_id: string;
  display_id: string;
  name: string;
  photo: string;
  datasheet: string;
  description: string;
  status: AssetStatus;
  location: string;
  assigned_project: string;
  template_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComponentRecord {
  component_id: string;
  display_id: string;
  asset_id: string;
  category_id: string;
  name: string;
  serial_number: string;
  manufacturer: string;
  description: string;
  equipment_type: string;
  structure: string;
  model: string;
  class: string;
  class_code: string;
  safety_critical: SafetyCritical;
  location: string;
  assigned_project: string;
  created_at: string;
  updated_at: string;
}

export interface Certificate {
  certificate_id: string;
  display_id: string;
  component_id: string;
  certificate_name: string;
  issue_date: string | null;
  expiry_date: string | null;
  certificate_file: string;
  issuing_authority: string;
  status: CertificateStatus;
  test_id: string;
  imca_ref: string;
  imca_d018: string;
  maintenance_notes: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  category_id: string;
  display_id: string;
  main_category_id: string | null;
  sort_order: number;
  category_name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface MainCategory {
  main_category_id: string;
  display_id: string;
  sort_order: number;
  main_category_name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface TestType {
  test_id: string;
  display_id: string;
  test_name: string;
  validity_duration: number;
  description: string;
}

export interface AssetTemplate {
  template_id: string;
  display_id: string;
  template_name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateComponent {
  template_component_id: string;
  display_id: string;
  template_id: string;
  category_id: string;
  position: number;
  name: string;
  description: string;
  serial_number: string;
  manufacturer: string;
  equipment_type: string;
  structure: string;
  model: string;
  class: string;
  class_code: string;
  safety_critical: SafetyCritical;
  location: string;
  assigned_project: string;
  created_at: string;
}

export interface TemplateComponentTest {
  template_component_test_id: string;
  template_component_test_display_id: string;
  template_component_id: string;
  test_id: string;
  position: number;
  created_at: string;
  test_name: string;
  validity_duration: number;
  description: string;
}

export interface CertificateUploadAudit {
  certificate_id: string;
  file_key: string;
  file_name: string;
  uploaded_by: string;
  uploaded_at: string | null;
}

export interface AssetInput {
  name: string;
  photo: string;
  datasheet: string;
  description: string;
  status: AssetStatus;
  location: string;
  assigned_project: string;
  template_id: string | null;
}

export interface ComponentInput {
  asset_id: string;
  category_id: string;
  name: string;
  serial_number: string;
  manufacturer: string;
  description: string;
  location: string;
  assigned_project: string;
  equipment_type: string;
  structure: string;
  model: string;
  class: string;
  class_code: string;
  safety_critical: SafetyCritical;
}

export interface CertificateInput {
  component_id: string;
  certificate_name: string;
  issue_date: string;
  expiry_date: string;
  certificate_file: string;
  issuing_authority: string;
  test_id: string;
  imca_ref: string;
  imca_d018: string;
  maintenance_notes: string;
}

export interface PatchCertificateInput {
  component_id?: string;
  certificate_name?: string;
  issue_date?: string;
  expiry_date?: string;
  certificate_file?: string;
  issuing_authority?: string;
  test_id?: string;
  imca_ref?: string;
  imca_d018?: string;
  maintenance_notes?: string;
}

export interface UpdatePasswordInput {
  current_password: string;
  new_password: string;
}

export interface CreateUserInput {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role: Role;
}

export interface UserAccount {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface AssetTemplateInput {
  template_name: string;
  description: string;
}

export interface TemplateComponentInput {
  category_id: string;
  name: string;
  description: string;
  serial_number: string;
  manufacturer: string;
  location: string;
  assigned_project: string;
  equipment_type: string;
  structure: string;
  model: string;
  class: string;
  class_code: string;
  safety_critical: SafetyCritical;
}

export interface ConfigureTemplateComponentItem extends TemplateComponentInput {
  template_component_id?: string;
  test_ids: string[];
}

export interface ConfigureTemplateInput {
  components: ConfigureTemplateComponentItem[];
}

export interface TemplateConfigurationComponent extends TemplateComponent {
  tests: TemplateComponentTest[];
}

export interface MainCategoryInput {
  main_category_name: string;
  description: string;
  sort_order: number;
}

export interface CategoryInput {
  main_category_id: string;
  category_name: string;
  description: string;
  sort_order: number;
}

export interface TestTypeInput {
  test_name: string;
  validity_duration: number;
  description: string;
}

export interface AssetDashboardData {
  asset: Asset;
  components: ComponentRecord[];
  certificates: Array<Certificate & { component_name: string }>;
  statusCounts: {
    expired: number;
    expiringSoon: number;
    valid: number;
    pending: number;
  };
  urgentCertificates: Array<Certificate & { component_name: string }>;
  latestCertificates: Array<Certificate & { component_name: string }>;
}
