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

// ==================== Asset DTOs ====================

type AssetInput struct {
	Name            string  `json:"name" validate:"required,min=2,max=200"`
	Photo           string  `json:"photo" validate:"omitempty,url"`
	Datasheet       string  `json:"datasheet" validate:"omitempty,url"`
	Description     string  `json:"description"`
	Status          string  `json:"status" validate:"required,oneof=ACTIVE INACTIVE MAINTENANCE"`
	Location        string  `json:"location"`
	AssignedProject string  `json:"assigned_project"`
	TemplateID      *string `json:"template_id" validate:"omitempty,uuid"`
}

type PatchAssetInput struct {
	Name            *string `json:"name" validate:"omitempty,min=2,max=200"`
	Photo           *string `json:"photo" validate:"omitempty,url"`
	Datasheet       *string `json:"datasheet" validate:"omitempty,url"`
	Description     *string `json:"description"`
	Status          *string `json:"status" validate:"omitempty,oneof=ACTIVE INACTIVE MAINTENANCE"`
	Location        *string `json:"location"`
	AssignedProject *string `json:"assigned_project"`
}

// ==================== Component DTOs ====================

type ComponentInput struct {
	AssetID         string `json:"asset_id" validate:"required,uuid"`
	CategoryID      string `json:"category_id" validate:"required,uuid"`
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
	ComponentID      string    `json:"component_id" validate:"required,uuid"`
	CertificateName  string    `json:"certificate_name" validate:"required,min=2,max=200"`
	IssueDate        time.Time `json:"issue_date" validate:"required"`
	ExpiryDate       time.Time `json:"expiry_date" validate:"required"`
	CertificateFile  string    `json:"certificate_file" validate:"omitempty,url"`
	IssuingAuthority string    `json:"issuing_authority" validate:"required,min=2,max=200"`
	TestID           string    `json:"test_id" validate:"required,uuid"`
	IMCARef          string    `json:"imca_ref"`
	IMCAD018         string    `json:"imca_d018"`
	MaintenanceNotes string    `json:"maintenance_notes"`
}

type PatchCertificateInput struct {
	ComponentID      *string    `json:"component_id" validate:"omitempty,uuid"`
	CertificateName  *string    `json:"certificate_name" validate:"omitempty,min=2,max=200"`
	IssueDate        *time.Time `json:"issue_date"`
	ExpiryDate       *time.Time `json:"expiry_date"`
	CertificateFile  *string    `json:"certificate_file" validate:"omitempty,url"`
	IssuingAuthority *string    `json:"issuing_authority" validate:"omitempty,min=2,max=200"`
	TestID           *string    `json:"test_id" validate:"omitempty,uuid"`
	IMCARef          *string    `json:"imca_ref"`
	IMCAD018         *string    `json:"imca_d018"`
	MaintenanceNotes *string    `json:"maintenance_notes"`
}

// ==================== Test Type DTOs ====================

type TestTypeInput struct {
	TestName         string `json:"test_name" validate:"required,min=2,max=100"`
	ValidityDuration int32  `json:"validity_duration" validate:"required,min=1"`
	Description      string `json:"description"`
}

type PatchTestTypeInput struct {
	TestName         *string `json:"test_name" validate:"omitempty,min=2,max=100"`
	ValidityDuration *int32  `json:"validity_duration" validate:"omitempty,min=1"`
	Description      *string `json:"description"`
}

// ==================== Asset Template DTOs ====================

type AssetTemplateInput struct {
	TemplateName string `json:"template_name" validate:"required,min=2,max=200"`
	Description  string `json:"description"`
}

type TemplateComponentInput struct {
	CategoryID      string `json:"category_id" validate:"required,uuid"`
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
	TestID string `json:"test_id" validate:"required,uuid"`
}

type ConfigureTemplateComponentItem struct {
	TemplateComponentID string   `json:"template_component_id"`
	CategoryID          string   `json:"category_id" validate:"required,uuid"`
	Name                string   `json:"name" validate:"required,min=2,max=200"`
	Description         string   `json:"description"`
	SerialNumber        string   `json:"serial_number"`
	Manufacturer        string   `json:"manufacturer"`
	Location            string   `json:"location"`
	AssignedProject     string   `json:"assigned_project"`
	EquipmentType       string   `json:"equipment_type"`
	Structure           string   `json:"structure"`
	Model               string   `json:"model"`
	Class               string   `json:"class"`
	ClassCode           string   `json:"class_code"`
	SafetyCritical      string   `json:"safety_critical" validate:"required,oneof=YES NO"`
	TestIDs             []string `json:"test_ids" validate:"required,dive,required,uuid"`
}

type ConfigureTemplateInput struct {
	Components []ConfigureTemplateComponentItem `json:"components" validate:"required,dive"`
}

type TemplateComponentTestDetailResponse struct {
	TemplateComponentTestID        string    `json:"template_component_test_id"`
	TemplateComponentTestDisplayID string    `json:"template_component_test_display_id"`
	TemplateComponentID            string    `json:"template_component_id"`
	TestID                         string    `json:"test_id"`
	Position                       int32     `json:"position"`
	CreatedAt                      time.Time `json:"created_at"`
	TestName                       string    `json:"test_name"`
	ValidityDuration               int32     `json:"validity_duration"`
	Description                    string    `json:"description"`
}

type TemplateConfigurationComponentResponse struct {
	TemplateComponentID string                                `json:"template_component_id"`
	DisplayID           string                                `json:"display_id"`
	TemplateID          string                                `json:"template_id"`
	CategoryID          string                                `json:"category_id"`
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
