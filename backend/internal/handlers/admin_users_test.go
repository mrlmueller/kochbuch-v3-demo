package handlers

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/db"
	"backend/internal/models"
)

func userPtr(id, email string) *models.User {
	return &models.User{ID: id, Email: email, Status: models.StatusActive}
}

type fakeProvisioner struct {
	called    string
	err       error
	deleted   string
	deleteErr error
}

func (f *fakeProvisioner) CreatePasswordUser(_ context.Context, email string) error {
	f.called = email
	return f.err
}

func (f *fakeProvisioner) DeleteUserByEmail(_ context.Context, email string) error {
	f.deleted = email
	return f.deleteErr
}

type fakeMailer struct {
	sent string
	err  error
}

func (m *fakeMailer) SendSetupLink(_ context.Context, email string) error {
	m.sent = email
	return m.err
}

func TestCreateUser_GoogleDefault(t *testing.T) {
	store := &db.MockStore{CreatedUser: &models.User{ID: "1", Email: "a@b.c"}}
	fp := &fakeProvisioner{}
	fm := &fakeMailer{}
	req := httptest.NewRequest("POST", "/api/admin/users", bytes.NewBufferString(`{"email":"a@b.c"}`))
	rec := httptest.NewRecorder()
	CreateUser(store, fp, fm).ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d", rec.Code)
	}
	if store.LastCreatedMethod != models.AuthGoogle {
		t.Fatalf("want google, got %q", store.LastCreatedMethod)
	}
	if fp.called != "" {
		t.Fatalf("google invite must not provision firebase, got %q", fp.called)
	}
	if fm.sent != "" {
		t.Fatalf("google invite must not send a setup email, got %q", fm.sent)
	}
}

func TestCreateUser_PasswordProvisions(t *testing.T) {
	store := &db.MockStore{CreatedUser: &models.User{ID: "1", Email: "a@b.c"}}
	fp := &fakeProvisioner{}
	fm := &fakeMailer{}
	req := httptest.NewRequest("POST", "/api/admin/users", bytes.NewBufferString(`{"email":"a@b.c","method":"password"}`))
	rec := httptest.NewRecorder()
	CreateUser(store, fp, fm).ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d", rec.Code)
	}
	if store.LastCreatedMethod != models.AuthPassword {
		t.Fatalf("want password, got %q", store.LastCreatedMethod)
	}
	if fp.called != "a@b.c" {
		t.Fatalf("want firebase provision for a@b.c, got %q", fp.called)
	}
	if fm.sent != "a@b.c" {
		t.Fatalf("want setup email sent to a@b.c, got %q", fm.sent)
	}
}

func TestCreateUser_PasswordEmailTaken(t *testing.T) {
	store := &db.MockStore{CreatedUser: &models.User{ID: "1"}}
	fp := &fakeProvisioner{err: ErrFirebaseEmailExists}
	req := httptest.NewRequest("POST", "/api/admin/users", bytes.NewBufferString(`{"email":"a@b.c","method":"password"}`))
	rec := httptest.NewRecorder()
	CreateUser(store, fp, &fakeMailer{}).ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d", rec.Code)
	}
	if store.LastCreatedEmail != "" {
		t.Fatalf("must not create allowlist row when firebase fails")
	}
}

func TestCreateUser_DuplicateAllowlist(t *testing.T) {
	store := &db.MockStore{GotUserByEmail: &models.User{ID: "1", Email: "a@b.c"}}
	fp := &fakeProvisioner{}
	req := httptest.NewRequest("POST", "/api/admin/users", bytes.NewBufferString(`{"email":"a@b.c"}`))
	rec := httptest.NewRecorder()
	CreateUser(store, fp, &fakeMailer{}).ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d", rec.Code)
	}
}

func TestCreateUser_InvalidMethod(t *testing.T) {
	store := &db.MockStore{}
	fp := &fakeProvisioner{}
	req := httptest.NewRequest("POST", "/api/admin/users", bytes.NewBufferString(`{"email":"a@b.c","method":"sms"}`))
	rec := httptest.NewRecorder()
	CreateUser(store, fp, &fakeMailer{}).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

// Deleting a user must also delete their Firebase account, otherwise the
// removed user can still receive password emails / authenticate.
func TestDeleteUser_RemovesFirebaseAccount(t *testing.T) {
	store := &db.MockStore{UserByID: userPtr("1", "a@b.c")}
	fp := &fakeProvisioner{}
	req := httptest.NewRequest("DELETE", "/api/admin/users/1", nil)
	rec := httptest.NewRecorder()
	DeleteUser(store, fp).ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("want 204, got %d", rec.Code)
	}
	if fp.deleted != "a@b.c" {
		t.Fatalf("expected firebase account a@b.c deleted, got %q", fp.deleted)
	}
	if !store.DeleteUserCalled {
		t.Fatalf("expected the allowlist row to be deleted")
	}
}

// A Firebase deletion failure must abort before the DB row is removed, so we
// never leave a dangling Firebase account behind.
func TestDeleteUser_AbortsWhenFirebaseFails(t *testing.T) {
	store := &db.MockStore{UserByID: userPtr("1", "a@b.c")}
	fp := &fakeProvisioner{deleteErr: errors.New("firebase down")}
	req := httptest.NewRequest("DELETE", "/api/admin/users/1", nil)
	rec := httptest.NewRecorder()
	DeleteUser(store, fp).ServeHTTP(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("want 500, got %d", rec.Code)
	}
	if store.DeleteUserCalled {
		t.Fatalf("must NOT delete the allowlist row when firebase deletion fails")
	}
}
