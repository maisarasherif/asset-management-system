package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Certificate struct {
	ID               bson.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	CertificateID    string        `bson:"certificate_id" json:"certificate_id" validate:"required"`
	ComponentID      string        `bson:"component_id" json:"component_id" validate:"required"`
	CertificateName  string        `bson:"certificate_name" json:"certificate_name" validate:"required,min=2,max=200"`
	IssueDate        time.Time     `bson:"issue_date" json:"issue_date" validate:"required"`
	ExpiryDate       time.Time     `bson:"expiry_date" json:"expiry_date" validate:"required,gtefield=IssueDate"`
	CertificateFile  *string       `bson:"certificate_file" json:"certificate_file" validate:"omitempty,url"`
	IssuingAuthority string        `bson:"issuing_authority" json:"issuing_authority" validate:"required,min=2,max=200"`
	Status           string        `bson:"status" json:"status" validate:"oneof=VALID EXPIRED EXPIRING_SOON"`
	CreatedAt        time.Time     `bson:"created_at" json:"created_at"`
	UpdatedAt        time.Time     `bson:"updated_at" json:"updated_at"`
}
