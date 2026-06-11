package handlers

import (
	"context"
	"errors"

	"firebase.google.com/go/v4/auth"
)

// ErrFirebaseEmailExists means a Firebase account already uses this email.
var ErrFirebaseEmailExists = errors.New("firebase: email already exists")

// FirebaseProvisioner manages the Firebase Auth accounts behind admin invites.
// Abstracted so the admin handlers are testable without a live Firebase project.
type FirebaseProvisioner interface {
	CreatePasswordUser(ctx context.Context, email string) error
	// DeleteUserByEmail removes the Firebase account for email. A missing
	// account is treated as success (idempotent), so removing a user who never
	// had a Firebase account is not an error.
	DeleteUserByEmail(ctx context.Context, email string) error
}

type fbProvisioner struct{ c *auth.Client }

// NewFirebaseProvisioner wraps the Firebase Admin SDK client.
func NewFirebaseProvisioner(c *auth.Client) FirebaseProvisioner { return &fbProvisioner{c} }

func (f *fbProvisioner) CreatePasswordUser(ctx context.Context, email string) error {
	// The random password is a placeholder; the user sets their own via the
	// Firebase password-reset email triggered client-side after this succeeds.
	pw, err := generateToken()
	if err != nil {
		return err
	}
	params := (&auth.UserToCreate{}).Email(email).Password(pw)
	if _, err := f.c.CreateUser(ctx, params); err != nil {
		if auth.IsEmailAlreadyExists(err) {
			return ErrFirebaseEmailExists
		}
		return err
	}
	return nil
}

func (f *fbProvisioner) DeleteUserByEmail(ctx context.Context, email string) error {
	u, err := f.c.GetUserByEmail(ctx, email)
	if err != nil {
		if auth.IsUserNotFound(err) {
			return nil // nothing to delete
		}
		return err
	}
	return f.c.DeleteUser(ctx, u.UID)
}
