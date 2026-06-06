package handlers

import (
	"context"
	"errors"

	"firebase.google.com/go/v4/auth"
)

// ErrFirebaseEmailExists means a Firebase account already uses this email.
var ErrFirebaseEmailExists = errors.New("firebase: email already exists")

// FirebaseProvisioner creates password-based Firebase accounts for admin invites.
// Abstracted so the admin handler is testable without a live Firebase project.
type FirebaseProvisioner interface {
	CreatePasswordUser(ctx context.Context, email string) error
}

type fbProvisioner struct{ c *auth.Client }

// NewFirebaseProvisioner wraps the Firebase Admin SDK client.
func NewFirebaseProvisioner(c *auth.Client) FirebaseProvisioner { return &fbProvisioner{c} }

func (f *fbProvisioner) CreatePasswordUser(ctx context.Context, email string) error {
	// The random password is a placeholder; the user sets their own via the
	// Firebase password-reset email triggered client-side after this succeeds.
	params := (&auth.UserToCreate{}).Email(email).Password(generateToken())
	if _, err := f.c.CreateUser(ctx, params); err != nil {
		if auth.IsEmailAlreadyExists(err) {
			return ErrFirebaseEmailExists
		}
		return err
	}
	return nil
}
