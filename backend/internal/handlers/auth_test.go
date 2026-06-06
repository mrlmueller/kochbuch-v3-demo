package handlers

import (
	"context"
	"testing"

	"backend/internal/db"
	"backend/internal/models"
)

func ptrMethod(m models.AuthMethod) *models.AuthMethod { return &m }

func TestResolveUser_ProviderMismatchGoogleAccount(t *testing.T) {
	store := &db.MockStore{GotUserByEmail: &models.User{ID: "1", Email: "a@b.c", Status: models.StatusActive, AuthMethod: ptrMethod(models.AuthGoogle)}}
	_, status, code := resolveUser(context.Background(), store, "a@b.c", "password")
	if status != 403 || code != "use_google" {
		t.Fatalf("got %d %q, want 403 use_google", status, code)
	}
}

func TestResolveUser_ProviderMismatchPasswordAccount(t *testing.T) {
	store := &db.MockStore{GotUserByEmail: &models.User{ID: "1", Email: "a@b.c", Status: models.StatusActive, AuthMethod: ptrMethod(models.AuthPassword)}}
	_, status, code := resolveUser(context.Background(), store, "a@b.c", "google.com")
	if status != 403 || code != "use_password" {
		t.Fatalf("got %d %q, want 403 use_password", status, code)
	}
}

func TestResolveUser_MatchingProviderSucceeds(t *testing.T) {
	store := &db.MockStore{GotUserByEmail: &models.User{ID: "1", Email: "a@b.c", Status: models.StatusActive, AuthMethod: ptrMethod(models.AuthGoogle)}}
	u, status, code := resolveUser(context.Background(), store, "a@b.c", "google.com")
	if u == nil || status != 0 || code != "" {
		t.Fatalf("got %v %d %q, want success", u, status, code)
	}
}

func TestResolveUser_NullMethodLocksOnFirstLogin(t *testing.T) {
	store := &db.MockStore{GotUserByEmail: &models.User{ID: "7", Email: "a@b.c", Status: models.StatusActive, AuthMethod: nil}}
	u, status, _ := resolveUser(context.Background(), store, "a@b.c", "password")
	if u == nil || status != 0 {
		t.Fatalf("want success, got status %d", status)
	}
	if store.LastSetAuthID != "7" || store.LastSetAuthMethod != models.AuthPassword {
		t.Fatalf("expected lock to password on id 7, got %q %q", store.LastSetAuthID, store.LastSetAuthMethod)
	}
}

func TestResolveUser_NotAllowlisted(t *testing.T) {
	store := &db.MockStore{GotUserByEmail: nil}
	_, status, _ := resolveUser(context.Background(), store, "x@y.z", "google.com")
	if status != 403 {
		t.Fatalf("want 403, got %d", status)
	}
}

func TestResolveUser_Deactivated(t *testing.T) {
	store := &db.MockStore{GotUserByEmail: &models.User{ID: "1", Status: models.StatusDeactivated, AuthMethod: ptrMethod(models.AuthGoogle)}}
	_, status, _ := resolveUser(context.Background(), store, "a@b.c", "google.com")
	if status != 403 {
		t.Fatalf("want 403, got %d", status)
	}
}

func TestResolveUser_UnknownProvider(t *testing.T) {
	store := &db.MockStore{GotUserByEmail: &models.User{ID: "1", Status: models.StatusActive, AuthMethod: ptrMethod(models.AuthGoogle)}}
	_, status, _ := resolveUser(context.Background(), store, "a@b.c", "phone")
	if status != 401 {
		t.Fatalf("want 401, got %d", status)
	}
}
