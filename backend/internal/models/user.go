package models

import "time"

type Role   string
type Status string

const (
	RoleAdmin Role   = "admin"
	RoleUser  Role   = "user"
	StatusActive      Status = "active"
	StatusDeactivated Status = "deactivated"
)

type User struct {
	ID        string     `json:"id"`
	Email     string     `json:"email"`
	Role      Role       `json:"role"`
	Status    Status     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
	LastLogin *time.Time `json:"last_login,omitempty"`
}
