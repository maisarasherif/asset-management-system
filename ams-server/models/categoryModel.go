package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Category struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	CategoryID   string        `bson:"category_id" json:"category_id" validate:"required"`
	CategoryName string        `bson:"category_name" json:"category_name" validate:"required,min=2,max=100"`
	Description  *string       `bson:"description" json:"description" validate:"omitempty"`
	CreatedAt    time.Time     `bson:"created_at" json:"created_at"`
	UpdatedAt    time.Time     `bson:"updated_at" json:"updated_at"`
}
