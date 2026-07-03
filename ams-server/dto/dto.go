package dto

import (
	"encoding/json"
	"reflect"
	"time"
)

// ==================== Pagination DTOs ====================

type PaginationQuery struct {
	Page  int `json:"page"`
	Limit int `json:"limit"`
}

type PaginationMeta struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

type PaginatedResponse struct {
	Data interface{}    `json:"data"`
	Meta PaginationMeta `json:"meta"`
}

func normalizePaginatedData(data interface{}) interface{} {
	if data == nil {
		return []interface{}{}
	}

	value := reflect.ValueOf(data)
	if value.Kind() == reflect.Slice && value.IsNil() {
		return reflect.MakeSlice(value.Type(), 0, 0).Interface()
	}

	return data
}

func NormalizeListData(data interface{}) interface{} {
	return normalizePaginatedData(data)
}

func (r PaginatedResponse) MarshalJSON() ([]byte, error) {
	type responseAlias struct {
		Data interface{}    `json:"data"`
		Meta PaginationMeta `json:"meta"`
	}

	return json.Marshal(responseAlias{
		Data: normalizePaginatedData(r.Data),
		Meta: r.Meta,
	})
}

// ==================== User DTOs ====================

type RegisterInput struct {
	FirstName string `json:"first_name" validate:"required,min=2,max=100"`
	LastName  string `json:"last_name" validate:"required,min=2,max=100"`
	Email     string `json:"email" validate:"required,email"`
	Password  string `json:"password" validate:"required,min=6"`
	Role      string `json:"role" validate:"required,oneof=SUPER_ADMIN ADMIN USER CLIENT"`
	Status    string `json:"status" validate:"omitempty,oneof=ACTIVE SUSPENDED"`
}

type LoginInput struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
}

type UpdateUserInput struct {
	FirstName string `json:"first_name" validate:"required,min=2,max=100"`
	LastName  string `json:"last_name" validate:"required,min=2,max=100"`
	Email     string `json:"email" validate:"required,email"`
	Role      string `json:"role" validate:"required,oneof=SUPER_ADMIN ADMIN USER CLIENT"`
	Status    string `json:"status" validate:"required,oneof=ACTIVE SUSPENDED"`
}

type PatchUserInput struct {
	FirstName *string `json:"first_name" validate:"omitempty,min=2,max=100"`
	LastName  *string `json:"last_name" validate:"omitempty,min=2,max=100"`
	Email     *string `json:"email" validate:"omitempty,email"`
	Role      *string `json:"role" validate:"omitempty,oneof=SUPER_ADMIN ADMIN USER CLIENT"`
	Status    *string `json:"status" validate:"omitempty,oneof=ACTIVE SUSPENDED"`
}

type UpdatePasswordInput struct {
	CurrentPassword string `json:"current_password" validate:"required,min=6"`
	NewPassword     string `json:"new_password" validate:"required,min=6"`
}

type AdminUpdateUserPasswordInput struct {
	NewPassword string `json:"new_password" validate:"required,min=6"`
}

type UserResponse struct {
	UserID    string    `json:"user_id"`
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type LoginResponse struct {
	UserID                 string    `json:"user_id"`
	FirstName              string    `json:"first_name"`
	LastName               string    `json:"last_name"`
	Email                  string    `json:"email"`
	Role                   string    `json:"role"`
	Status                 string    `json:"status"`
	Token                  string    `json:"token,omitempty"`
	ExpiresAt              time.Time `json:"expires_at"`
	CanManageUserPasswords bool      `json:"can_manage_user_passwords"`
}

type UserManagementAuditLogResponse struct {
	AuditID          string    `json:"audit_id"`
	ActorUserID      string    `json:"actor_user_id"`
	ActorEmail       string    `json:"actor_email"`
	Action           string    `json:"action"`
	TargetUserID     string    `json:"target_user_id"`
	TargetEmail      string    `json:"target_email"`
	TargetRoleBefore string    `json:"target_role_before"`
	TargetRoleAfter  string    `json:"target_role_after"`
	Details          string    `json:"details"`
	IPAddress        string    `json:"ip_address"`
	CreatedAt        time.Time `json:"created_at"`
}

// ==================== Platform Product DTOs ====================

type ProductAccessInput struct {
	UserID      string `json:"user_id" validate:"required,uuid"`
	ProductKey  string `json:"product_key" validate:"required,oneof=AMS HR_ADMIN"`
	ProductRole string `json:"product_role" validate:"required,oneof=ADMIN USER VIEWER CLIENT"`
	Status      string `json:"status" validate:"required,oneof=ACTIVE SUSPENDED"`
}

type ProductNotificationConfigurationInput struct {
	EmailRecipients     string  `json:"email_recipients"`
	ClickUpListID       string  `json:"clickup_list_id"`
	ClickUpAssigneeID   string  `json:"clickup_assignee_ids"`
	DefaultReminderDays []int32 `json:"default_reminder_days"`
}

type CertificateNotificationTaskResponse struct {
	TaskID               string     `json:"task_id"`
	DisplayID            string     `json:"display_id"`
	SourceType           string     `json:"source_type"`
	SourceID             string     `json:"source_id"`
	SourceDisplayID      string     `json:"source_display_id"`
	SourceName           string     `json:"source_name"`
	CertificateID        string     `json:"certificate_id"`
	CertificateDisplayID string     `json:"certificate_display_id"`
	CertificateName      string     `json:"certificate_name"`
	ExpiryDate           *time.Time `json:"expiry_date"`
	ComponentID          string     `json:"component_id"`
	ComponentDisplayID   string     `json:"component_display_id"`
	ComponentName        string     `json:"component_name"`
	AssetID              string     `json:"asset_id"`
	AssetDisplayID       string     `json:"asset_display_id"`
	AssetName            string     `json:"asset_name"`
	Type                 string     `json:"type"`
	Tier                 string     `json:"tier"`
	Status               string     `json:"status"`
	ExternalTaskID       string     `json:"external_task_id"`
	IdempotencyKey       string     `json:"idempotency_key"`
	SentAt               time.Time  `json:"sent_at"`
}

type CertificateNotificationFailureResponse struct {
	ID                   string     `json:"id"`
	SourceType           string     `json:"source_type"`
	SourceID             string     `json:"source_id"`
	SourceDisplayID      string     `json:"source_display_id"`
	SourceName           string     `json:"source_name"`
	CertificateID        string     `json:"certificate_id"`
	CertificateDisplayID string     `json:"certificate_display_id"`
	CertificateName      string     `json:"certificate_name"`
	ExpiryDate           *time.Time `json:"expiry_date"`
	ComponentID          string     `json:"component_id"`
	ComponentDisplayID   string     `json:"component_display_id"`
	ComponentName        string     `json:"component_name"`
	AssetID              string     `json:"asset_id"`
	AssetDisplayID       string     `json:"asset_display_id"`
	AssetName            string     `json:"asset_name"`
	IdempotencyKey       string     `json:"idempotency_key"`
	Channel              string     `json:"channel"`
	Tier                 string     `json:"tier"`
	ErrorMessage         string     `json:"error_message"`
	FailedAt             time.Time  `json:"failed_at"`
}

// ==================== Project Access DTOs ====================

type ProjectInput struct {
	ProjectName string `json:"project_name" validate:"required,min=2,max=200"`
	Description string `json:"description"`
	Status      string `json:"status" validate:"required,oneof=ACTIVE ARCHIVED"`
}

type UserProjectAccessInput struct {
	ProjectID string `json:"project_id" validate:"required,uuid"`
	Status    string `json:"status" validate:"required,oneof=ACTIVE SUSPENDED"`
}

// ==================== Competency DTOs ====================

type CompetencyCategoryInput struct {
	CategoryCode string `json:"category_code" validate:"required,min=2,max=60"`
	CategoryName string `json:"category_name" validate:"required,min=2,max=120"`
	Description  string `json:"description"`
	Active       bool   `json:"active"`
}

type CompetentPersonInput struct {
	FullName             string `json:"full_name" validate:"required,min=2,max=160"`
	PersonType           string `json:"person_type" validate:"required,oneof=Internal External"`
	Organization         string `json:"organization"`
	CompetencyCategoryID string `json:"competency_category_id" validate:"required,uuid"`
	Active               bool   `json:"active"`
}

// ==================== HR/Admin DTOs ====================

type HRAdminPersonInput struct {
	PersonCode string `json:"person_code"`
	FullName   string `json:"full_name" validate:"required,min=2,max=160"`
	Department string `json:"department"`
	RoleTitle  string `json:"role_title"`
}

type HRAdminVehicleInput struct {
	PlateNumber string `json:"plate_number" validate:"required,min=2,max=60"`
	Make        string `json:"make"`
	Model       string `json:"model"`
	VehicleYear *int32 `json:"vehicle_year" validate:"omitempty,min=1900,max=2200"`
}

type HRAdminCompanyInput struct {
	CompanyCode string `json:"company_code"`
	CompanyName string `json:"company_name" validate:"required,min=2,max=200"`
	CompanyKind string `json:"company_kind" validate:"required,oneof=LEGAL_ENTITY OFFICE STAFF_HOUSING WAREHOUSE YARD OTHER"`
	Location    string `json:"location"`
}

type ArchiveInput struct {
	ArchiveReason string `json:"archive_reason" validate:"required,min=3,max=500"`
}

type ComplianceRecordTypeInput struct {
	SubjectType           string  `json:"subject_type" validate:"required,oneof=PERSON VEHICLE COMPANY"`
	TypeName              string  `json:"type_name" validate:"required,min=2,max=160"`
	RenewalBehavior       string  `json:"renewal_behavior" validate:"required,oneof=RENEWABLE ONE_TIME"`
	DefaultValidityMonths *int32  `json:"default_validity_months" validate:"omitempty,min=1,max=1200"`
	ReminderPolicyDays    []int32 `json:"reminder_policy_days" validate:"omitempty,dive,min=0,max=3650"`
	RequiresDocument      bool    `json:"requires_document"`
	Active                bool    `json:"active"`
	Description           string  `json:"description"`
}

type ComplianceRecordInput struct {
	SubjectType      string     `json:"subject_type" validate:"required,oneof=PERSON VEHICLE COMPANY"`
	SubjectID        string     `json:"subject_id" validate:"required,uuid"`
	RecordTypeID     string     `json:"record_type_id" validate:"required,uuid"`
	IssueDate        *time.Time `json:"issue_date"`
	ExpiryDate       *time.Time `json:"expiry_date"`
	DocumentFile     string     `json:"document_file"`
	IssuingAuthority string     `json:"issuing_authority"`
	Notes            string     `json:"notes"`
}

type ComplianceRecordVersionInput struct {
	IssueDate        *time.Time `json:"issue_date"`
	ExpiryDate       *time.Time `json:"expiry_date"`
	DocumentFile     string     `json:"document_file"`
	IssuingAuthority string     `json:"issuing_authority"`
	Notes            string     `json:"notes"`
}

// ==================== Category DTOs ====================

type CategoryInput struct {
	MainCategoryID string `json:"main_category_id" validate:"required,uuid"`
	CategoryName   string `json:"category_name" validate:"required,min=2,max=100"`
	Description    string `json:"description"`
	SortOrder      int32  `json:"sort_order" validate:"required,min=1"`
}

type PatchCategoryInput struct {
	MainCategoryID *string `json:"main_category_id" validate:"omitempty,uuid"`
	CategoryName   *string `json:"category_name" validate:"omitempty,min=2,max=100"`
	Description    *string `json:"description"`
	SortOrder      *int32  `json:"sort_order" validate:"omitempty,min=1"`
}

type MainCategoryInput struct {
	MainCategoryName string `json:"main_category_name" validate:"required,min=2,max=100"`
	Description      string `json:"description"`
	SortOrder        int32  `json:"sort_order" validate:"required,min=1"`
}

type PatchMainCategoryInput struct {
	MainCategoryName *string `json:"main_category_name" validate:"omitempty,min=2,max=100"`
	Description      *string `json:"description"`
	SortOrder        *int32  `json:"sort_order" validate:"omitempty,min=1"`
}

type CatalogScopeInput struct {
	ScopeName   string `json:"scope_name" validate:"required,min=2,max=160"`
	Description string `json:"description"`
}

type CatalogScopeDuplicateInput struct {
	ScopeName   string `json:"scope_name" validate:"required,min=2,max=160"`
	Description string `json:"description"`
}

type CatalogScopeMainCategoryInput struct {
	MainCategoryName string `json:"main_category_name" validate:"required,min=2,max=100"`
	Description      string `json:"description"`
	SortOrder        int32  `json:"sort_order" validate:"required,min=1"`
}

type CatalogScopeCategoryInput struct {
	MainCategoryID string `json:"main_category_id" validate:"required,uuid"`
	CategoryName   string `json:"category_name" validate:"required,min=2,max=100"`
	Description    string `json:"description"`
	SortOrder      int32  `json:"sort_order" validate:"required,min=1"`
}

// ==================== Asset DTOs ====================

type AssetInput struct {
	Name                     string                           `json:"name" validate:"required,min=2,max=200"`
	Photo                    string                           `json:"photo" validate:"omitempty,url"`
	Datasheet                string                           `json:"datasheet" validate:"omitempty,url"`
	Description              string                           `json:"description"`
	Status                   string                           `json:"status" validate:"required,oneof=ACTIVE INACTIVE MAINTENANCE"`
	AssetKind                string                           `json:"asset_kind" validate:"omitempty,oneof=COMPONENTIZED SINGLE_EQUIPMENT"`
	Location                 string                           `json:"location"`
	AssignedProject          string                           `json:"assigned_project"`
	MaintenanceIntervalHours *int64                           `json:"maintenance_interval_hours" validate:"omitempty,min=0"`
	TemplateID               *string                          `json:"template_id" validate:"omitempty,uuid"`
	SingleEquipment          *SingleAssetEquipmentCreateInput `json:"single_equipment" validate:"omitempty"`
}

type PatchAssetInput struct {
	Name                     *string `json:"name" validate:"omitempty,min=2,max=200"`
	Photo                    *string `json:"photo" validate:"omitempty,url"`
	Datasheet                *string `json:"datasheet" validate:"omitempty,url"`
	Description              *string `json:"description"`
	Status                   *string `json:"status" validate:"omitempty,oneof=ACTIVE INACTIVE MAINTENANCE"`
	Location                 *string `json:"location"`
	AssignedProject          *string `json:"assigned_project"`
	MaintenanceIntervalHours *int64  `json:"maintenance_interval_hours" validate:"omitempty,min=0"`
}

type SingleAssetEquipmentCreateInput struct {
	EquipmentTypeID string   `json:"equipment_type_id" validate:"required,uuid"`
	TestTypeIDs     []string `json:"test_type_ids" validate:"required,min=1,dive,uuid"`
}

type AssetWorkingHoursInput struct {
	WorkingHours int64  `json:"working_hours" validate:"min=0"`
	Note         string `json:"note"`
}

type CompleteAssetMaintenanceInput struct {
	CompletionNotes string `json:"completion_notes"`
}

type AssetMaintenanceNotificationDeliveryResponse struct {
	DeliveryID         string     `json:"delivery_id"`
	MaintenanceEventID string     `json:"maintenance_event_id"`
	Channel            string     `json:"channel"`
	Status             string     `json:"status"`
	ExternalID         string     `json:"external_id"`
	ErrorMessage       string     `json:"error_message"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	SentAt             *time.Time `json:"sent_at"`
	FailedAt           *time.Time `json:"failed_at"`
}

type AssetMaintenanceEventResponse struct {
	MaintenanceEventID  string                                         `json:"maintenance_event_id"`
	DisplayID           string                                         `json:"display_id"`
	AssetID             string                                         `json:"asset_id"`
	DueAtHours          int64                                          `json:"due_at_hours"`
	TriggeredAtHours    int64                                          `json:"triggered_at_hours"`
	PreviousAssetStatus string                                         `json:"previous_asset_status"`
	Status              string                                         `json:"status"`
	CompletedAt         *time.Time                                     `json:"completed_at"`
	CompletionNotes     string                                         `json:"completion_notes"`
	CreatedAt           time.Time                                      `json:"created_at"`
	Notifications       []AssetMaintenanceNotificationDeliveryResponse `json:"notifications"`
}

// ==================== Component DTOs ====================

type ComponentInput struct {
	AssetID         string `json:"asset_id" validate:"required,uuid"`
	CategoryID      string `json:"category_id" validate:"required,uuid"`
	ScopeCategoryID string `json:"scope_category_id" validate:"omitempty,uuid"`
	Name            string `json:"name" validate:"required,min=2,max=200"`
	SerialNumber    string `json:"serial_number"`
	Manufacturer    string `json:"manufacturer"`
	Description     string `json:"description"`
	Location        string `json:"location"`
	AssignedProject string `json:"assigned_project"`
	EquipmentType   string `json:"equipment_type"`
	Structure       string `json:"structure"`
	Model           string `json:"model"`
	Class           string `json:"class"`
	ClassCode       string `json:"class_code"`
	SafetyCritical  string `json:"safety_critical" validate:"required,oneof=YES NO"`
}

type PatchComponentInput struct {
	CategoryID      *string `json:"category_id" validate:"omitempty,uuid"`
	ScopeCategoryID *string `json:"scope_category_id" validate:"omitempty,uuid"`
	Name            *string `json:"name" validate:"omitempty,min=2,max=200"`
	SerialNumber    *string `json:"serial_number"`
	Manufacturer    *string `json:"manufacturer"`
	Description     *string `json:"description"`
	Location        *string `json:"location"`
	AssignedProject *string `json:"assigned_project"`
	EquipmentType   *string `json:"equipment_type"`
	Structure       *string `json:"structure"`
	Model           *string `json:"model"`
	Class           *string `json:"class"`
	ClassCode       *string `json:"class_code"`
	SafetyCritical  *string `json:"safety_critical" validate:"omitempty,oneof=YES NO"`
}

// ==================== Certificate DTOs ====================

type CertificateInput struct {
	ComponentID           string     `json:"component_id" validate:"required,uuid"`
	CertificateName       string     `json:"certificate_name" validate:"required,min=2,max=200"`
	IssueDate             time.Time  `json:"issue_date" validate:"required"`
	ExpiryDate            *time.Time `json:"expiry_date"`
	IssuingAuthority      string     `json:"issuing_authority" validate:"required,min=2,max=200"`
	TestID                string     `json:"test_id" validate:"required,uuid"`
	IMCARef               string     `json:"imca_ref"`
	IMCAD018              string     `json:"imca_d018"`
	MaintenanceNotes      string     `json:"maintenance_notes"`
	CompetencyCategoryIDs []string   `json:"competency_category_ids" validate:"omitempty,dive,uuid"`
}

type PatchCertificateInput struct {
	ComponentID      *string    `json:"component_id" validate:"omitempty,uuid"`
	CertificateName  *string    `json:"certificate_name" validate:"omitempty,min=2,max=200"`
	IssueDate        *time.Time `json:"issue_date"`
	ExpiryDate       *time.Time `json:"expiry_date"`
	IssuingAuthority *string    `json:"issuing_authority" validate:"omitempty,min=2,max=200"`
	TestID           *string    `json:"test_id" validate:"omitempty,uuid"`
	IMCARef          *string    `json:"imca_ref"`
	IMCAD018         *string    `json:"imca_d018"`
	MaintenanceNotes *string    `json:"maintenance_notes"`
}

// ==================== Test Type DTOs ====================

type TestTypeInput struct {
	TestName         string `json:"test_name" validate:"required,min=2,max=100"`
	ValidityDuration *int32 `json:"validity_duration" validate:"omitempty,min=1"`
	RequiresRenewal  *bool  `json:"requires_renewal"`
	Description      string `json:"description"`
}

type PatchTestTypeInput struct {
	TestName         *string `json:"test_name" validate:"omitempty,min=2,max=100"`
	ValidityDuration *int32  `json:"validity_duration" validate:"omitempty,min=1"`
	RequiresRenewal  *bool   `json:"requires_renewal"`
	Description      *string `json:"description"`
}

type CompetencyCategoryRuleResponse struct {
	CompetencyCategoryID string `json:"competency_category_id"`
	CategoryCode         string `json:"category_code"`
	CategoryName         string `json:"category_name"`
	Description          string `json:"description"`
	Active               bool   `json:"active"`
}

type CertificateResponse struct {
	CertificateID               string                           `json:"certificate_id"`
	DisplayID                   string                           `json:"display_id"`
	ComponentID                 string                           `json:"component_id"`
	CertificateName             string                           `json:"certificate_name"`
	IssueDate                   *time.Time                       `json:"issue_date"`
	ExpiryDate                  *time.Time                       `json:"expiry_date"`
	CertificateFile             string                           `json:"certificate_file"`
	IssuingAuthority            string                           `json:"issuing_authority"`
	Status                      string                           `json:"status"`
	TestID                      string                           `json:"test_id"`
	IMCARef                     string                           `json:"imca_ref"`
	IMCAD018                    string                           `json:"imca_d018"`
	MaintenanceNotes            string                           `json:"maintenance_notes"`
	CompetencyCategoryIDs       []string                         `json:"competency_category_ids"`
	AllowedCompetencyCategories []CompetencyCategoryRuleResponse `json:"allowed_competency_categories"`
	CreatedAt                   time.Time                        `json:"created_at"`
	UpdatedAt                   time.Time                        `json:"updated_at"`
}

// ==================== Equipment Type DTOs ====================

type EquipmentTypeInput struct {
	SortOrder         int32  `json:"sort_order" validate:"required,min=1"`
	EquipmentTypeName string `json:"equipment_type_name" validate:"required,min=2,max=120"`
	Description       string `json:"description"`
}

type PatchEquipmentTypeInput struct {
	SortOrder         *int32  `json:"sort_order" validate:"omitempty,min=1"`
	EquipmentTypeName *string `json:"equipment_type_name" validate:"omitempty,min=2,max=120"`
	Description       *string `json:"description"`
}

// ==================== Asset Template DTOs ====================

type AssetTemplateInput struct {
	TemplateName string `json:"template_name" validate:"required,min=2,max=200"`
	Description  string `json:"description"`
}

type TemplateComponentInput struct {
	CategoryID      string `json:"category_id" validate:"required,uuid"`
	ScopeCategoryID string `json:"scope_category_id" validate:"omitempty,uuid"`
	Name            string `json:"name" validate:"required,min=2,max=200"`
	Description     string `json:"description"`
	SerialNumber    string `json:"serial_number"`
	Manufacturer    string `json:"manufacturer"`
	Location        string `json:"location"`
	AssignedProject string `json:"assigned_project"`
	EquipmentType   string `json:"equipment_type"`
	Structure       string `json:"structure"`
	Model           string `json:"model"`
	Class           string `json:"class"`
	ClassCode       string `json:"class_code"`
	SafetyCritical  string `json:"safety_critical" validate:"required,oneof=YES NO"`
}

type TemplateComponentTestInput struct {
	TestID                string   `json:"test_id" validate:"required,uuid"`
	CompetencyCategoryIDs []string `json:"competency_category_ids" validate:"omitempty,dive,uuid"`
}

type ConfigureTemplateComponentTestItem struct {
	TestID                string   `json:"test_id" validate:"required,uuid"`
	CompetencyCategoryIDs []string `json:"competency_category_ids" validate:"omitempty,dive,uuid"`
}

type ConfigureTemplateComponentItem struct {
	TemplateComponentID string                               `json:"template_component_id"`
	CategoryID          string                               `json:"category_id" validate:"required,uuid"`
	ScopeCategoryID     string                               `json:"scope_category_id" validate:"omitempty,uuid"`
	Name                string                               `json:"name" validate:"required,min=2,max=200"`
	Description         string                               `json:"description"`
	SerialNumber        string                               `json:"serial_number"`
	Manufacturer        string                               `json:"manufacturer"`
	Location            string                               `json:"location"`
	AssignedProject     string                               `json:"assigned_project"`
	EquipmentType       string                               `json:"equipment_type"`
	Structure           string                               `json:"structure"`
	Model               string                               `json:"model"`
	Class               string                               `json:"class"`
	ClassCode           string                               `json:"class_code"`
	SafetyCritical      string                               `json:"safety_critical" validate:"required,oneof=YES NO"`
	TestIDs             []string                             `json:"test_ids" validate:"omitempty,dive,required,uuid"`
	Tests               []ConfigureTemplateComponentTestItem `json:"tests" validate:"omitempty,dive"`
}

type ConfigureTemplateInput struct {
	Components []ConfigureTemplateComponentItem `json:"components" validate:"required,dive"`
}

type TemplateComponentTestDetailResponse struct {
	TemplateComponentTestID        string                           `json:"template_component_test_id"`
	TemplateComponentTestDisplayID string                           `json:"template_component_test_display_id"`
	TemplateComponentID            string                           `json:"template_component_id"`
	TestID                         string                           `json:"test_id"`
	Position                       int32                            `json:"position"`
	CreatedAt                      time.Time                        `json:"created_at"`
	TestName                       string                           `json:"test_name"`
	ValidityDuration               *int32                           `json:"validity_duration"`
	RequiresRenewal                bool                             `json:"requires_renewal"`
	Description                    string                           `json:"description"`
	CompetencyCategoryIDs          []string                         `json:"competency_category_ids"`
	AllowedCompetencyCategories    []CompetencyCategoryRuleResponse `json:"allowed_competency_categories"`
}

type TemplateConfigurationComponentResponse struct {
	TemplateComponentID string                                `json:"template_component_id"`
	DisplayID           string                                `json:"display_id"`
	TemplateID          string                                `json:"template_id"`
	CategoryID          string                                `json:"category_id"`
	ScopeCategoryID     string                                `json:"scope_category_id"`
	Position            int32                                 `json:"position"`
	Name                string                                `json:"name"`
	Description         string                                `json:"description"`
	SerialNumber        string                                `json:"serial_number"`
	Manufacturer        string                                `json:"manufacturer"`
	EquipmentType       string                                `json:"equipment_type"`
	Structure           string                                `json:"structure"`
	Model               string                                `json:"model"`
	Class               string                                `json:"class"`
	ClassCode           string                                `json:"class_code"`
	SafetyCritical      string                                `json:"safety_critical"`
	CreatedAt           time.Time                             `json:"created_at"`
	Location            string                                `json:"location"`
	AssignedProject     string                                `json:"assigned_project"`
	Tests               []TemplateComponentTestDetailResponse `json:"tests"`
}
