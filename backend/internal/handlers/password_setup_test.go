package handlers

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/db"
	"backend/internal/models"
)

func TestBuildSetupURL_Valid(t *testing.T) {
	link := "https://kochbuch-v3.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=ABC123&apiKey=x&lang=de"
	got, err := buildSetupURL(link, "https://kochbuch-v3.vercel.app")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := "https://kochbuch-v3.vercel.app/auth/action?mode=resetPassword&oobCode=ABC123"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestBuildSetupURL_TrailingSlashFrontend(t *testing.T) {
	link := "https://kochbuch-v3.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=XYZ"
	got, err := buildSetupURL(link, "https://kochbuch-v3.vercel.app/")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := "https://kochbuch-v3.vercel.app/auth/action?mode=resetPassword&oobCode=XYZ"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestBuildSetupURL_MissingCode(t *testing.T) {
	if _, err := buildSetupURL("https://x.firebaseapp.com/__/auth/action?mode=resetPassword", "https://f"); err == nil {
		t.Fatalf("expected error for missing oobCode")
	}
}

func postSetup(t *testing.T, store db.Store, mailer SetupMailer, email string) int {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/auth/request-password-setup", bytes.NewBufferString(`{"email":"`+email+`"}`))
	rec := httptest.NewRecorder()
	RequestPasswordSetup(store, mailer).ServeHTTP(rec, req)
	return rec.Code
}

func TestRequestPasswordSetup_PasswordUserSends(t *testing.T) {
	store := &db.MockStore{GotUserByEmail: &models.User{ID: "1", Email: "a@b.c", Status: models.StatusActive, AuthMethod: ptrMethod(models.AuthPassword)}}
	fm := &fakeMailer{}
	if code := postSetup(t, store, fm, "a@b.c"); code != http.StatusOK {
		t.Fatalf("want 200, got %d", code)
	}
	if fm.sent != "a@b.c" {
		t.Fatalf("expected setup email sent, got %q", fm.sent)
	}
}

func TestRequestPasswordSetup_GoogleUserNoSend(t *testing.T) {
	store := &db.MockStore{GotUserByEmail: &models.User{ID: "1", Status: models.StatusActive, AuthMethod: ptrMethod(models.AuthGoogle)}}
	fm := &fakeMailer{}
	if code := postSetup(t, store, fm, "a@b.c"); code != http.StatusOK {
		t.Fatalf("want 200, got %d", code)
	}
	if fm.sent != "" {
		t.Fatalf("google user must not get a password-setup email, got %q", fm.sent)
	}
}

func TestRequestPasswordSetup_UnknownNoSend(t *testing.T) {
	store := &db.MockStore{GotUserByEmail: nil}
	fm := &fakeMailer{}
	if code := postSetup(t, store, fm, "x@y.z"); code != http.StatusOK {
		t.Fatalf("want 200 (no enumeration), got %d", code)
	}
	if fm.sent != "" {
		t.Fatalf("unknown email must not trigger a send, got %q", fm.sent)
	}
}

func TestRequestPasswordSetup_DeactivatedNoSend(t *testing.T) {
	store := &db.MockStore{GotUserByEmail: &models.User{ID: "1", Status: models.StatusDeactivated, AuthMethod: ptrMethod(models.AuthPassword)}}
	fm := &fakeMailer{}
	if code := postSetup(t, store, fm, "a@b.c"); code != http.StatusOK {
		t.Fatalf("want 200, got %d", code)
	}
	if fm.sent != "" {
		t.Fatalf("deactivated user must not get a setup email, got %q", fm.sent)
	}
}

func TestRequestPasswordSetup_MissingEmail(t *testing.T) {
	store := &db.MockStore{}
	fm := &fakeMailer{}
	req := httptest.NewRequest("POST", "/api/auth/request-password-setup", bytes.NewBufferString(`{}`))
	rec := httptest.NewRecorder()
	RequestPasswordSetup(store, fm).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}
