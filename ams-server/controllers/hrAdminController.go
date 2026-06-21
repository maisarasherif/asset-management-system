package controllers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func int4Value(value *int32) pgtype.Int4 {
	if value == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: *value, Valid: true}
}

func timestamptzValue(value *time.Time) pgtype.Timestamptz {
	if value == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: *value, Valid: true}
}

func reminderPolicyDays(days []int32) []int32 {
	if len(days) == 0 {
		return []int32{30, 7, 1}
	}
	return days
}

func validateComplianceRecordTypeInput(input dto.ComplianceRecordTypeInput) error {
	if input.RenewalBehavior == "ONE_TIME" && input.DefaultValidityMonths != nil {
		return errors.New("default validity duration must be omitted for one-time compliance record types")
	}
	return nil
}

func validateComplianceVersionInput(recordType db.ComplianceRecordType, issueDate, expiryDate *time.Time, documentFile string) error {
	if recordType.RenewalBehavior == "RENEWABLE" && expiryDate == nil {
		return errors.New("expiry date is required for renewable compliance record types")
	}
	if recordType.RequiresDocument && documentFile == "" {
		return errors.New("document file is required for this compliance record type")
	}
	if issueDate != nil && expiryDate != nil && !expiryDate.After(*issueDate) {
		return errors.New("expiry date must be after issue date")
	}
	return nil
}

func validateHRAdminSubject(ctx context.Context, queries *db.Queries, subjectType string, subjectID uuid.UUID, requireActive bool) error {
	switch subjectType {
	case "PERSON":
		person, err := queries.GetHRAdminPersonByID(ctx, subjectID)
		if err != nil {
			return err
		}
		if requireActive && person.Status != "ACTIVE" {
			return errors.New("person is archived")
		}
	case "VEHICLE":
		vehicle, err := queries.GetHRAdminVehicleByID(ctx, subjectID)
		if err != nil {
			return err
		}
		if requireActive && vehicle.Status != "ACTIVE" {
			return errors.New("vehicle is archived")
		}
	case "COMPANY":
		company, err := queries.GetHRAdminCompanyByID(ctx, subjectID)
		if err != nil {
			return err
		}
		if requireActive && company.Status != "ACTIVE" {
			return errors.New("company is archived")
		}
	default:
		return errors.New("invalid subject type")
	}
	return nil
}

func GetHRAdminPersons(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)
		people, err := queries.GetHRAdminPersonsPaginated(ctx, db.GetHRAdminPersonsPaginatedParams{Limit: limit, Offset: offset})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch HR/Admin persons"})
			return
		}
		total, err := queries.CountHRAdminPersons(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count HR/Admin persons"})
			return
		}
		c.JSON(http.StatusOK, dto.PaginatedResponse{Data: people, Meta: utils.BuildMeta(query, total)})
	}
}

func CreateHRAdminPerson(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.HRAdminPersonInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		person, err := db.New(pool).CreateHRAdminPerson(ctx, db.CreateHRAdminPersonParams{
			PersonCode: input.PersonCode,
			FullName:   input.FullName,
			Department: input.Department,
			RoleTitle:  input.RoleTitle,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "person code is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create HR/Admin person"})
			return
		}
		c.JSON(http.StatusCreated, person)
	}
}

func UpdateHRAdminPerson(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		personID, ok := utils.ParseUUIDParam(c, "person_id")
		if !ok {
			return
		}
		var input dto.HRAdminPersonInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		rows, err := db.New(pool).UpdateHRAdminPerson(ctx, db.UpdateHRAdminPersonParams{
			PersonCode: input.PersonCode,
			FullName:   input.FullName,
			Department: input.Department,
			RoleTitle:  input.RoleTitle,
			PersonID:   personID,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "person code is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update HR/Admin person"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "HR/Admin person not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "HR/Admin person updated successfully"})
	}
}

func ArchiveHRAdminPerson(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		personID, ok := utils.ParseUUIDParam(c, "person_id")
		if !ok {
			return
		}
		var input dto.ArchiveInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		rows, err := db.New(pool).ArchiveHRAdminPerson(ctx, db.ArchiveHRAdminPersonParams{
			PersonID:      personID,
			ArchiveReason: input.ArchiveReason,
			ArchivedBy:    actorUUID(c),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to archive HR/Admin person"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "active HR/Admin person not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "HR/Admin person archived successfully"})
	}
}

func GetHRAdminVehicles(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)
		vehicles, err := queries.GetHRAdminVehiclesPaginated(ctx, db.GetHRAdminVehiclesPaginatedParams{Limit: limit, Offset: offset})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch HR/Admin vehicles"})
			return
		}
		total, err := queries.CountHRAdminVehicles(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count HR/Admin vehicles"})
			return
		}
		c.JSON(http.StatusOK, dto.PaginatedResponse{Data: vehicles, Meta: utils.BuildMeta(query, total)})
	}
}

func CreateHRAdminVehicle(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.HRAdminVehicleInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		vehicle, err := db.New(pool).CreateHRAdminVehicle(ctx, db.CreateHRAdminVehicleParams{
			PlateNumber: input.PlateNumber,
			Make:        input.Make,
			Model:       input.Model,
			VehicleYear: int4Value(input.VehicleYear),
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "plate number is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create HR/Admin vehicle"})
			return
		}
		c.JSON(http.StatusCreated, vehicle)
	}
}

func UpdateHRAdminVehicle(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		vehicleID, ok := utils.ParseUUIDParam(c, "vehicle_id")
		if !ok {
			return
		}
		var input dto.HRAdminVehicleInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		rows, err := db.New(pool).UpdateHRAdminVehicle(ctx, db.UpdateHRAdminVehicleParams{
			PlateNumber: input.PlateNumber,
			Make:        input.Make,
			Model:       input.Model,
			VehicleYear: int4Value(input.VehicleYear),
			VehicleID:   vehicleID,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "plate number is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update HR/Admin vehicle"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "HR/Admin vehicle not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "HR/Admin vehicle updated successfully"})
	}
}

func ArchiveHRAdminVehicle(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		vehicleID, ok := utils.ParseUUIDParam(c, "vehicle_id")
		if !ok {
			return
		}
		var input dto.ArchiveInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		rows, err := db.New(pool).ArchiveHRAdminVehicle(ctx, db.ArchiveHRAdminVehicleParams{
			VehicleID:     vehicleID,
			ArchiveReason: input.ArchiveReason,
			ArchivedBy:    actorUUID(c),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to archive HR/Admin vehicle"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "active HR/Admin vehicle not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "HR/Admin vehicle archived successfully"})
	}
}

func GetHRAdminCompanies(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)
		companies, err := queries.GetHRAdminCompaniesPaginated(ctx, db.GetHRAdminCompaniesPaginatedParams{Limit: limit, Offset: offset})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch HR/Admin companies"})
			return
		}
		total, err := queries.CountHRAdminCompanies(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count HR/Admin companies"})
			return
		}
		c.JSON(http.StatusOK, dto.PaginatedResponse{Data: companies, Meta: utils.BuildMeta(query, total)})
	}
}

func CreateHRAdminCompany(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.HRAdminCompanyInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		company, err := db.New(pool).CreateHRAdminCompany(ctx, db.CreateHRAdminCompanyParams{
			CompanyCode: input.CompanyCode,
			CompanyName: input.CompanyName,
			CompanyKind: input.CompanyKind,
			Location:    input.Location,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "company code is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create HR/Admin company"})
			return
		}
		c.JSON(http.StatusCreated, company)
	}
}

func UpdateHRAdminCompany(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID, ok := utils.ParseUUIDParam(c, "company_id")
		if !ok {
			return
		}
		var input dto.HRAdminCompanyInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		rows, err := db.New(pool).UpdateHRAdminCompany(ctx, db.UpdateHRAdminCompanyParams{
			CompanyCode: input.CompanyCode,
			CompanyName: input.CompanyName,
			CompanyKind: input.CompanyKind,
			Location:    input.Location,
			CompanyID:   companyID,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "company code is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update HR/Admin company"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "HR/Admin company not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "HR/Admin company updated successfully"})
	}
}

func ArchiveHRAdminCompany(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID, ok := utils.ParseUUIDParam(c, "company_id")
		if !ok {
			return
		}
		var input dto.ArchiveInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		rows, err := db.New(pool).ArchiveHRAdminCompany(ctx, db.ArchiveHRAdminCompanyParams{
			CompanyID:     companyID,
			ArchiveReason: input.ArchiveReason,
			ArchivedBy:    actorUUID(c),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to archive HR/Admin company"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "active HR/Admin company not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "HR/Admin company archived successfully"})
	}
}

func GetComplianceRecordTypes(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)
		recordTypes, err := queries.GetComplianceRecordTypesPaginated(ctx, db.GetComplianceRecordTypesPaginatedParams{Limit: limit, Offset: offset})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch compliance record types"})
			return
		}
		total, err := queries.CountComplianceRecordTypes(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count compliance record types"})
			return
		}
		c.JSON(http.StatusOK, dto.PaginatedResponse{Data: recordTypes, Meta: utils.BuildMeta(query, total)})
	}
}

func CreateComplianceRecordType(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.ComplianceRecordTypeInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		if err := validateComplianceRecordTypeInput(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		recordType, err := db.New(pool).CreateComplianceRecordType(ctx, db.CreateComplianceRecordTypeParams{
			SubjectType:           input.SubjectType,
			TypeName:              input.TypeName,
			RenewalBehavior:       input.RenewalBehavior,
			DefaultValidityMonths: int4Value(input.DefaultValidityMonths),
			ReminderPolicyDays:    reminderPolicyDays(input.ReminderPolicyDays),
			RequiresDocument:      input.RequiresDocument,
			Active:                input.Active,
			Description:           input.Description,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "compliance record type is already in use for this subject type"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create compliance record type"})
			return
		}
		c.JSON(http.StatusCreated, recordType)
	}
}

func UpdateComplianceRecordType(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		recordTypeID, ok := utils.ParseUUIDParam(c, "record_type_id")
		if !ok {
			return
		}
		var input dto.ComplianceRecordTypeInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		if err := validateComplianceRecordTypeInput(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		rows, err := db.New(pool).UpdateComplianceRecordType(ctx, db.UpdateComplianceRecordTypeParams{
			RecordTypeID:          recordTypeID,
			SubjectType:           input.SubjectType,
			TypeName:              input.TypeName,
			RenewalBehavior:       input.RenewalBehavior,
			DefaultValidityMonths: int4Value(input.DefaultValidityMonths),
			ReminderPolicyDays:    reminderPolicyDays(input.ReminderPolicyDays),
			RequiresDocument:      input.RequiresDocument,
			Active:                input.Active,
			Description:           input.Description,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "compliance record type is already in use for this subject type"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update compliance record type"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "compliance record type not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "compliance record type updated successfully"})
	}
}

func GetComplianceRecords(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)
		records, err := queries.GetComplianceRecordsPaginated(ctx, db.GetComplianceRecordsPaginatedParams{Limit: limit, Offset: offset})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch compliance records"})
			return
		}
		total, err := queries.CountComplianceRecords(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count compliance records"})
			return
		}
		c.JSON(http.StatusOK, dto.PaginatedResponse{Data: records, Meta: utils.BuildMeta(query, total)})
	}
}

func CreateComplianceRecord(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.ComplianceRecordInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		subjectID, err := utils.ParseUUID(input.SubjectID, "subject_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		recordTypeID, err := utils.ParseUUID(input.RecordTypeID, "record_type_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to begin compliance record transaction"})
			return
		}
		defer tx.Rollback(ctx)
		queries := db.New(tx)

		recordType, err := queries.GetComplianceRecordTypeByID(ctx, recordTypeID)
		if err != nil {
			if err == pgx.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "compliance record type not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate compliance record type"})
			return
		}
		if !recordType.Active {
			c.JSON(http.StatusBadRequest, gin.H{"error": "compliance record type is inactive"})
			return
		}
		if recordType.SubjectType != input.SubjectType {
			c.JSON(http.StatusBadRequest, gin.H{"error": "subject type does not match compliance record type"})
			return
		}
		if err := validateHRAdminSubject(ctx, queries, input.SubjectType, subjectID, true); err != nil {
			if err == pgx.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "compliance subject not found"})
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := validateComplianceVersionInput(recordType, input.IssueDate, input.ExpiryDate, input.DocumentFile); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		record, err := queries.CreateComplianceRecord(ctx, db.CreateComplianceRecordParams{
			SubjectType:  input.SubjectType,
			SubjectID:    subjectID,
			RecordTypeID: recordTypeID,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "active compliance record already exists for this subject and type"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create compliance record"})
			return
		}

		version, err := queries.CreateComplianceRecordVersion(ctx, db.CreateComplianceRecordVersionParams{
			RecordID:         record.RecordID,
			IssueDate:        timestamptzValue(input.IssueDate),
			ExpiryDate:       timestamptzValue(input.ExpiryDate),
			DocumentFile:     input.DocumentFile,
			IssuingAuthority: input.IssuingAuthority,
			Notes:            input.Notes,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create compliance record version"})
			return
		}
		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit compliance record"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"record": record, "current_version": version})
	}
}

func RenewComplianceRecord(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		recordID, ok := utils.ParseUUIDParam(c, "record_id")
		if !ok {
			return
		}
		var input dto.ComplianceRecordVersionInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to begin compliance record renewal"})
			return
		}
		defer tx.Rollback(ctx)
		queries := db.New(tx)

		record, err := queries.GetComplianceRecordByID(ctx, recordID)
		if err != nil {
			if err == pgx.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "compliance record not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch compliance record"})
			return
		}
		if record.Status != "ACTIVE" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "archived compliance records cannot be renewed"})
			return
		}
		recordType, err := queries.GetComplianceRecordTypeByID(ctx, record.RecordTypeID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch compliance record type"})
			return
		}
		if err := validateHRAdminSubject(ctx, queries, record.SubjectType, record.SubjectID, true); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := validateComplianceVersionInput(recordType, input.IssueDate, input.ExpiryDate, input.DocumentFile); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := queries.SupersedeCurrentComplianceRecordVersion(ctx, recordID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to supersede current compliance record version"})
			return
		}
		version, err := queries.CreateComplianceRecordVersion(ctx, db.CreateComplianceRecordVersionParams{
			RecordID:         recordID,
			IssueDate:        timestamptzValue(input.IssueDate),
			ExpiryDate:       timestamptzValue(input.ExpiryDate),
			DocumentFile:     input.DocumentFile,
			IssuingAuthority: input.IssuingAuthority,
			Notes:            input.Notes,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create compliance record version"})
			return
		}
		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit compliance record renewal"})
			return
		}
		c.JSON(http.StatusCreated, version)
	}
}

func ArchiveComplianceRecord(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		recordID, ok := utils.ParseUUIDParam(c, "record_id")
		if !ok {
			return
		}
		var input dto.ArchiveInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		rows, err := db.New(pool).ArchiveComplianceRecord(ctx, db.ArchiveComplianceRecordParams{
			RecordID:      recordID,
			ArchiveReason: input.ArchiveReason,
			ArchivedBy:    actorUUID(c),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to archive compliance record"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "active compliance record not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "compliance record archived successfully"})
	}
}

func GetComplianceRecordVersions(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		recordID, ok := utils.ParseUUIDParam(c, "record_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		versions, err := db.New(pool).GetComplianceRecordVersions(ctx, recordID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch compliance record versions"})
			return
		}
		c.JSON(http.StatusOK, dto.NormalizeListData(versions))
	}
}

func GetHRAdminNotificationConfiguration(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		config, err := db.New(pool).GetProductNotificationConfiguration(ctx, ProductHRAdmin)
		if err != nil {
			if err == pgx.ErrNoRows {
				c.JSON(http.StatusOK, gin.H{
					"product_key":          ProductHRAdmin,
					"email_recipients":     "",
					"clickup_list_id":      "",
					"clickup_assignee_ids": "",
				})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch HR/Admin notification configuration"})
			return
		}
		c.JSON(http.StatusOK, config)
	}
}

func UpdateHRAdminNotificationConfiguration(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.ProductNotificationConfigurationInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		config, err := db.New(pool).UpsertProductNotificationConfiguration(ctx, db.UpsertProductNotificationConfigurationParams{
			ProductKey:         ProductHRAdmin,
			EmailRecipients:    input.EmailRecipients,
			ClickupListID:      input.ClickUpListID,
			ClickupAssigneeIds: input.ClickUpAssigneeID,
			UpdatedBy:          actorUUID(c),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update HR/Admin notification configuration"})
			return
		}
		c.JSON(http.StatusOK, config)
	}
}
