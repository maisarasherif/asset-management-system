package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Asset struct {
	ID              bson.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	AssetID         string        `bson:"asset_id" json:"asset_id" validate:"required"`
	Name            string        `bson:"name" json:"name" validate:"required,min=2,max=200"`
	CategoryID      string        `bson:"category_id" json:"category_id" validate:"required"`
	Photo           *string       `bson:"photo" json:"photo" validate:"omitempty,url"`
	Datasheet       *string       `bson:"datasheet" json:"datasheet" validate:"omitempty,url"`
	Description     *string       `bson:"description" json:"description" validate:"omitempty"`
	Status          string        `bson:"status" json:"status" validate:"oneof=ACTIVE INACTIVE MAINTENANCE"`
	Components      *[]Component  `bson:"components" json:"components" validate:"omitempty,dive"`
	Location        string        `json:"location" bson:"location"`
	AssignedProject string        `json:"assigned_project" bson:"assigned_project"`
	CreatedAt       time.Time     `bson:"created_at" json:"created_at"`
	UpdatedAt       time.Time     `bson:"updated_at" json:"updated_at"`
}
