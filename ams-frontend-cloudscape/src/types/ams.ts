export type Role = "SUPER_ADMIN" | "ADMIN" | "USER" | "CLIENT";
export type UserStatus = "ACTIVE" | "SUSPENDED";
export type ProjectStatus = "ACTIVE" | "ARCHIVED";
export type ProjectAccessStatus = "ACTIVE" | "SUSPENDED";
export type AssetStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE";
export type AssetKind = "COMPONENTIZED" | "SINGLE_EQUIPMENT";
export type CertificateStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "PENDING";
export type SafetyCritical = "YES" | "NO";
export type ComponentKind = "NORMAL" | "SELF";
export type CompetentPersonType = "Internal" | "External";

export interface AuthSession {
  userId: string;
  firstName: string;
  lastName: string;
	email: string;
	role: Role;
	status: UserStatus;
	expiresAt: string;
	canManageUserPasswords: boolean;
}

export interface LoginResponse {
  user_id: string;
  first_name: string;
  last_name: string;
	email: string;
	role: Role;
	status: UserStatus;
	token?: string;
	expires_at: string;
	can_manage_user_passwords?: boolean;
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
  asset_kind: AssetKind;
  location: string;
  assigned_project: string;
  working_hours: number;
  working_hours_note: string;
  maintenance_interval_hours: number;
  next_maintenance_due_hours: number;
  maintenance_required_at: string | null;
  last_maintenance_completed_at: string | null;
  last_maintenance_completed_hours: number;
  template_id: string | null;
  created_at: string;
  updated_at: string;
}

export type AssetMaintenanceStatus = "REQUIRED" | "COMPLETED" | "CANCELLED";

export interface AssetMaintenanceNotificationDelivery {
  delivery_id: string;
  maintenance_event_id: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  external_id: string;
  error_message: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  failed_at: string | null;
}

export interface AssetMaintenanceEvent {
  maintenance_event_id: string;
  display_id: string;
  asset_id: string;
  due_at_hours: number;
  triggered_at_hours: number;
  previous_asset_status: string;
  status: AssetMaintenanceStatus;
  completed_at: string | null;
  completion_notes: string;
  created_at: string;
  notifications: AssetMaintenanceNotificationDelivery[];
}

export interface ComponentRecord {
  component_id: string;
  display_id: string;
  asset_id: string;
  category_id: string | null;
  scope_category_id: string | null;
  component_kind: ComponentKind;
  single_asset_equipment_id: string | null;
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
  competency_category_ids: string[];
  allowed_competency_categories: CompetencyCategoryRule[];
  created_at: string;
  updated_at: string;
}

export interface CertificateWithContext {
  certificate_id: string;
  certificate_display_id: string;
  certificate_name: string;
  issue_date: string | null;
  expiry_date: string | null;
  status: CertificateStatus;
  issuing_authority: string;
  test_id: string;
  imca_ref: string;
  imca_d018: string;
  maintenance_notes: string;
  certificate_file: string;
  component_id: string;
  component_display_id: string;
  component_name: string;
  asset_id: string;
  asset_display_id: string;
  asset_name: string;
}

export type NotificationChannel = "EMAIL" | "CLICKUP";
export type NotificationSourceType = "certificate_expiry" | "routine_maintenance";
export type NotificationTier = "" | "expired" | "1d" | "7d" | "30d";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED";

export interface CertificateNotificationTask {
  task_id: string;
  display_id: string;
  source_type: NotificationSourceType;
  source_id: string;
  source_display_id: string;
  source_name: string;
  certificate_id: string;
  certificate_display_id: string;
  certificate_name: string;
  expiry_date: string | null;
  component_id: string;
  component_display_id: string;
  component_name: string;
  asset_id: string;
  asset_display_id: string;
  asset_name: string;
  type: NotificationChannel;
  tier: NotificationTier;
  status: NotificationStatus;
  external_task_id: string;
  idempotency_key: string;
  sent_at: string;
}

export interface CertificateNotificationFailure {
  id: string;
  source_type: NotificationSourceType;
  source_id: string;
  source_display_id: string;
  source_name: string;
  certificate_id: string;
  certificate_display_id: string;
  certificate_name: string;
  expiry_date: string | null;
  component_id: string;
  component_display_id: string;
  component_name: string;
  asset_id: string;
  asset_display_id: string;
  asset_name: string;
  idempotency_key: string;
  channel: NotificationChannel;
  tier: NotificationTier;
  error_message: string;
  failed_at: string;
}

export interface SchedulerRunResponse extends MessageResponse {
  processed_certificates: number;
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

export interface CatalogScope {
  scope_id: string;
  display_id: string;
  scope_name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CatalogScopeMainCategory {
  scope_main_category_id: string;
  display_id: string;
  scope_id: string;
  main_category_id: string;
  sort_order: number;
  main_category_display_id: string;
  main_category_name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CatalogScopeCategory {
  scope_category_id: string;
  display_id: string;
  scope_id: string;
  main_category_id: string;
  main_category_display_id: string;
  main_category_name: string;
  category_id: string;
  category_display_id: string;
  category_name: string;
  sort_order: number;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface TestType {
  test_id: string;
  display_id: string;
  test_name: string;
  validity_duration: number | null;
  requires_renewal: boolean;
  description: string;
}

export interface CompetencyCategoryRule {
  competency_category_id: string;
  category_code: string;
  category_name: string;
  description: string;
  active: boolean;
}

export interface EquipmentType {
  equipment_type_id: string;
  display_id: string;
  sort_order: number;
  equipment_type_name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface SingleAssetEquipment {
  single_asset_equipment_id: string;
  display_id: string;
  asset_id: string;
  equipment_type_id: string;
  equipment_type_display_id: string;
  equipment_type_name: string;
  equipment_type_description: string;
  self_component_id: string;
  self_component_display_id: string;
  created_at: string;
  updated_at: string;
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
  scope_category_id: string;
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
  validity_duration: number | null;
  requires_renewal: boolean;
  description: string;
  competency_category_ids: string[];
  allowed_competency_categories: CompetencyCategoryRule[];
}

export interface CertificateUploadAudit {
  uuid: string;
  certificate_id: string;
  file_key: string;
  file_name: string;
  uploaded_by_name: string;
  uploaded_at: string | null;
  competent_person_id: string | null;
  competent_person_name: string;
  competent_person_type: CompetentPersonType | "";
  competency_category_id: string | null;
  competency_category_code: string;
  competency_category_name: string;
  competency_category_description: string;
}

export interface CompetencyCategory {
  competency_category_id: string;
  category_code: string;
  category_name: string;
  description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompetencyCategoryInput {
  category_code: string;
  category_name: string;
  description: string;
  active: boolean;
}

export interface CompetentPerson {
  competent_person_id: string;
  full_name: string;
  person_type: CompetentPersonType;
  organization: string;
  competency_category_id: string;
  competency_category_code: string;
  competency_category_name: string;
  competency_category_description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompetentPersonInput {
  full_name: string;
  person_type: CompetentPersonType;
  organization: string;
  competency_category_id: string;
  active: boolean;
}

export interface AssetInput {
  name: string;
  photo: string;
  datasheet: string;
  description: string;
  status: AssetStatus;
  asset_kind: AssetKind;
  location: string;
  assigned_project: string;
  maintenance_interval_hours: number;
  template_id: string | null;
  single_equipment?: {
    equipment_type_id: string;
    test_type_ids: string[];
  };
}

export interface AssetWorkingHoursInput {
  working_hours: number;
  note: string;
}

export interface CompleteAssetMaintenanceInput {
  completion_notes: string;
}

export interface AssetMaintenanceUpdateResponse {
  asset: Asset;
  maintenance_event: AssetMaintenanceEvent | null;
}

export interface ComponentInput {
  asset_id: string;
  category_id: string;
  scope_category_id?: string;
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
  expiry_date: string | null;
  issuing_authority: string;
  test_id: string;
  imca_ref: string;
  imca_d018: string;
  maintenance_notes: string;
  competency_category_ids: string[];
}

export interface PatchCertificateInput {
  component_id?: string;
  certificate_name?: string;
  issue_date?: string;
  expiry_date?: string | null;
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

export interface AdminUpdateUserPasswordInput {
  new_password: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  new_password: string;
}

export interface CreateUserInput {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role: Role;
  status: UserStatus;
}

export interface UpdateUserInput {
  first_name: string;
  last_name: string;
  email: string;
  role: Role;
  status: UserStatus;
}

export interface UserAccount {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: Role;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface UserManagementAuditLog {
  audit_id: string;
  actor_user_id: string;
  actor_email: string;
  action: string;
  target_user_id: string;
  target_email: string;
  target_role_before: string;
  target_role_after: string;
  details: string;
  ip_address: string;
  created_at: string;
}

export interface Project {
  project_id: string;
  project_name: string;
  description: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectInput {
  project_name: string;
  description: string;
  status: ProjectStatus;
}

export interface UserProjectAccess {
  access_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: Role;
  user_status: UserStatus;
  project_id: string;
  project_name: string;
  project_status: ProjectStatus;
  status: ProjectAccessStatus;
  created_at: string;
  updated_at: string;
}

export interface UserProjectAccessInput {
  project_id: string;
  status: ProjectAccessStatus;
}

export interface AssetTemplateInput {
  template_name: string;
  description: string;
}

export interface TemplateComponentInput {
  category_id: string;
  scope_category_id?: string;
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
  test_ids?: string[];
  tests: Array<{
    test_id: string;
    competency_category_ids: string[];
  }>;
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

export interface CatalogScopeInput {
  scope_name: string;
  description: string;
}

export interface CatalogScopeMainCategoryInput {
  main_category_name: string;
  description: string;
  sort_order: number;
}

export interface CatalogScopeCategoryInput {
  main_category_id: string;
  category_name: string;
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
  validity_duration: number | null;
  requires_renewal: boolean;
  description: string;
}

export interface EquipmentTypeInput {
  equipment_type_name: string;
  description: string;
  sort_order: number;
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

export interface ClientCertificate {
  certificate_id: string;
  display_id: string;
  component_id: string;
  certificate_name: string;
  issue_date: string | null;
  expiry_date: string | null;
  issuing_authority: string;
  status: CertificateStatus;
  test_id: string;
  test_name: string;
  test_period_months: number | null;
  test_requires_renewal: boolean;
  imca_ref: string;
  imca_d018: string;
  maintenance_notes: string;
  has_file: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientComponent {
  component_id: string;
  display_id: string;
  asset_id: string;
  category_id: string | null;
  component_kind: ComponentKind;
  single_asset_equipment_id: string | null;
  main_category_name: string;
  category_name: string;
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

export interface ClientAssetDetail {
  asset: Asset;
  components: ClientComponent[];
  certificates: ClientCertificate[];
}
