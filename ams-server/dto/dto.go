package dto

import "time"

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

// ==================== User DTOs ====================

type RegisterInput struct {
	FirstName string `json:"first_name" validate:"required,min=2,max=100"`
	LastName  string `json:"last_name" validate:"required,min=2,max=100"`
	Email     string `json:"email" validate:"required,email"`
	Password  string `json:"password" validate:"required,min=6"`
	Role      string `json:"role" validate:"required,oneof=ADMIN USER"`
}

type LoginInput struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
}

type UpdateUserInput struct {
	FirstName string `json:"first_name" validate:"required,min=2,max=100"`
	LastName  string `json:"last_name" validate:"required,min=2,max=100"`
	Email     string `json:"email" validate:"required,email"`
	Role      string `json:"role" validate:"required,oneof=ADMIN USER"`
}

type PatchUserInput struct {
	FirstName *string `json:"first_name" validate:"omitempty,min=2,max=100"`
	LastName  *string `json:"last_name" validate:"omitempty,min=2,max=100"`
	Email     *string `json:"email" validate:"omitempty,email"`
	Role      *string `json:"role" validate:"omitempty,oneof=ADMIN USER"`
}

type UpdatePasswordInput struct {
	CurrentPassword string `json:"current_password" validate:"required,min=6"`
	NewPassword     string `json:"new_password" validate:"required,min=6"`
}

type UserResponse struct {
	UserID    string    `json:"user_id"`
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type LoginResponse struct {
	UserID       string `json:"user_id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	Email        string `json:"email"`
	Role         string `json:"role"`
	Token        string `json:"token"`
	RefreshToken string `json:"refresh_token"`
}

// ==================== Category DTOs ====================

type CategoryInput struct {
	CategoryName string `json:"category_name" validate:"required,min=2,max=100"`
	Description  string `json:"description"`
}

type PatchCategoryInput struct {
	CategoryName *string `json:"category_name" validate:"omitempty,min=2,max=100"`
	Description  *string `json:"description"`
}

// ==================== Asset DTOs ====================

type AssetInput struct {
	Name            string `json:"name" validate:"required,min=2,max=200"`
	Photo           string `json:"photo" validate:"omitempty,url"`
	Datasheet       string `json:"datasheet" validate:"omitempty,url"`
	Description     string `json:"description"`
	Status          string `json:"status" validate:"required,oneof=ACTIVE INACTIVE MAINTENANCE"`
	Location        string `json:"location"`
	AssignedProject string `json:"assigned_project"`
	TemplateID      string `json:"template_id"`
}

type PatchAssetInput struct {
	Name            *string `json:"name" validate:"omitempty,min=2,max=200"`
	Photo           *string `json:"photo" validate:"omitempty,url"`
	Datasheet       *string `json:"datasheet" validate:"omitempty,url"`
	Description     *string `json:"description"`
	Status          *string `json:"status" validate:"omitempty,oneof=ACTIVE INACTIVE MAINTENANCE"`
	Location        *string `json:"location"`
	AssignedProject *string `json:"assigned_project"`
	TemplateID      *string `json:"template_id"`
}

// ==================== Component DTOs ====================

type ComponentInput struct {
	AssetID        string `json:"asset_id" validate:"required"`
	CategoryID     string `json:"category_id" validate:"required"`
	Name           string `json:"name" validate:"required,min=2,max=200"`
	SerialNumber   string `json:"serial_number"`
	Manufacturer   string `json:"manufacturer"`
	Description    string `json:"description"`
	EquipmentType  string `json:"equipment_type"`
	Structure      string `json:"structure"`
	Model          string `json:"model"`
	Class          string `json:"class"`
	ClassCode      string `json:"class_code"`
	SafetyCritical string `json:"safety_critical" validate:"required,oneof=YES NO"`
}

type PatchComponentInput struct {
	CategoryID     *string `json:"category_id"`
	Name           *string `json:"name" validate:"omitempty,min=2,max=200"`
	SerialNumber   *string `json:"serial_number"`
	Manufacturer   *string `json:"manufacturer"`
	Description    *string `json:"description"`
	EquipmentType  *string `json:"equipment_type"`
	Structure      *string `json:"structure"`
	Model          *string `json:"model"`
	Class          *string `json:"class"`
	ClassCode      *string `json:"class_code"`
	SafetyCritical *string `json:"safety_critical" validate:"omitempty,oneof=YES NO"`
}

// ==================== Certificate DTOs ====================

type CertificateInput struct {
	ComponentID      string    `json:"component_id" validate:"required"`
	RequirementID    string    `json:"requirement_id"`
	CertificateName  string    `json:"certificate_name" validate:"required,min=2,max=200"`
	IssueDate        time.Time `json:"issue_date" validate:"required"`
	ExpiryDate       time.Time `json:"expiry_date" validate:"required"`
	CertificateFile  string    `json:"certificate_file" validate:"omitempty,url"`
	IssuingAuthority string    `json:"issuing_authority" validate:"required,min=2,max=200"`
	TestID           string    `json:"test_id"`
	IMCARef          string    `json:"imca_ref"`
	IMCAD018         string    `json:"imca_d018"`
	MaintenanceNotes string    `json:"maintenance_notes"`
}

type PatchCertificateInput struct {
	ComponentID      *string    `json:"component_id"`
	RequirementID    *string    `json:"requirement_id"`
	CertificateName  *string    `json:"certificate_name" validate:"omitempty,min=2,max=200"`
	IssueDate        *time.Time `json:"issue_date"`
	ExpiryDate       *time.Time `json:"expiry_date"`
	CertificateFile  *string    `json:"certificate_file" validate:"omitempty,url"`
	IssuingAuthority *string    `json:"issuing_authority" validate:"omitempty,min=2,max=200"`
	TestID           *string    `json:"test_id"`
	IMCARef          *string    `json:"imca_ref"`
	IMCAD018         *string    `json:"imca_d018"`
	MaintenanceNotes *string    `json:"maintenance_notes"`
}

// ==================== Asset Template DTOs ====================

type AssetTemplateRequirementInput struct {
	TemplateRequirementID string `json:"template_requirement_id"`
	TestID                string `json:"test_id" validate:"required"`
	Label                 string `json:"label" validate:"required,min=2,max=200"`
}

type AssetTemplateComponentInput struct {
	TemplateComponentID string                          `json:"template_component_id"`
	Name                string                          `json:"name" validate:"required,min=2,max=200"`
	SerialNumber        string                          `json:"serial_number"`
	Manufacturer        string                          `json:"manufacturer"`
	Description         string                          `json:"description"`
	EquipmentType       string                          `json:"equipment_type"`
	Structure           string                          `json:"structure"`
	Model               string                          `json:"model"`
	Class               string                          `json:"class"`
	ClassCode           string                          `json:"class_code"`
	SafetyCritical      string                          `json:"safety_critical" validate:"required,oneof=YES NO"`
	Requirements        []AssetTemplateRequirementInput `json:"requirements"`
}

type AssetTemplateCategoryInput struct {
	TemplateCategoryID string                        `json:"template_category_id"`
	CategoryID         string                        `json:"category_id" validate:"required"`
	Components         []AssetTemplateComponentInput `json:"components"`
}

type AssetTemplateInput struct {
	Name       string                       `json:"name" validate:"required,min=2,max=200"`
	Categories []AssetTemplateCategoryInput `json:"categories"`
}

type AssetTemplateRequirementResponse struct {
	TemplateRequirementID string `json:"template_requirement_id"`
	TestID                string `json:"test_id"`
	TestName              string `json:"test_name"`
	Label                 string `json:"label"`
	SortOrder             int32  `json:"sort_order"`
}

type AssetTemplateComponentResponse struct {
	TemplateComponentID string                             `json:"template_component_id"`
	Name                string                             `json:"name"`
	SerialNumber        string                             `json:"serial_number"`
	Manufacturer        string                             `json:"manufacturer"`
	Description         string                             `json:"description"`
	EquipmentType       string                             `json:"equipment_type"`
	Structure           string                             `json:"structure"`
	Model               string                             `json:"model"`
	Class               string                             `json:"class"`
	ClassCode           string                             `json:"class_code"`
	SafetyCritical      string                             `json:"safety_critical"`
	SortOrder           int32                              `json:"sort_order"`
	Requirements        []AssetTemplateRequirementResponse `json:"requirements"`
}

type AssetTemplateCategoryResponse struct {
	TemplateCategoryID string                           `json:"template_category_id"`
	CategoryID         string                           `json:"category_id"`
	CategoryName       string                           `json:"category_name"`
	SortOrder          int32                            `json:"sort_order"`
	Components         []AssetTemplateComponentResponse `json:"components"`
}

type AssetTemplateResponse struct {
	TemplateID string                          `json:"template_id"`
	Name       string                          `json:"name"`
	Categories []AssetTemplateCategoryResponse `json:"categories"`
}

// ==================== Requirement DTOs ====================

type ComponentRequirementInput struct {
	TestID string `json:"test_id" validate:"required"`
	Label  string `json:"label" validate:"required,min=2,max=200"`
}

type ComponentRequirementResponse struct {
	RequirementID               string `json:"requirement_id"`
	ComponentID                 string `json:"component_id"`
	SourceTemplateRequirementID string `json:"source_template_requirement_id"`
	TestID                      string `json:"test_id"`
	TestName                    string `json:"test_name"`
	ValidityDuration            int32  `json:"validity_duration"`
	TestDescription             string `json:"test_description"`
	Label                       string `json:"label"`
	SortOrder                   int32  `json:"sort_order"`
}

// ==================== Test Type DTOs ====================

type TestTypeInput struct {
	TestID           string `json:"test_id" validate:"required"`
	TestName         string `json:"test_name" validate:"required,min=2,max=100"`
	ValidityDuration int32  `json:"validity_duration" validate:"required,min=1"`
	Description      string `json:"description"`
}

type PatchTestTypeInput struct {
	TestName         *string `json:"test_name" validate:"omitempty,min=2,max=100"`
	ValidityDuration *int32  `json:"validity_duration" validate:"omitempty,min=1"`
	Description      *string `json:"description"`
}
