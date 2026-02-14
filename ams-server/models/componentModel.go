package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Component struct {
	ID           bson.ObjectID  `bson:"_id,omitempty" json:"_id,omitempty"`
	ComponentID  string         `bson:"component_id" json:"component_id" validate:"required"`
	AssetID      string         `bson:"asset_id" json:"asset_id" validate:"required"`
	Name         string         `bson:"name" json:"name" validate:"required,min=2,max=200"`
	SerialNumber *string        `bson:"serial_number" json:"serial_number" validate:"omitempty"`
	Manufacturer *string        `bson:"manufacturer" json:"manufacturer" validate:"omitempty"`
	Description  *string        `bson:"description" json:"description" validate:"omitempty"`
	Certificates *[]Certificate `bson:"certificates" json:"certificates" validate:"omitempty,dive"`
	CreatedAt    time.Time      `bson:"created_at" json:"created_at"`
	UpdatedAt    time.Time      `bson:"updated_at" json:"updated_at"`
}
