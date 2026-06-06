package handlers

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/db"
	"backend/internal/models"
)

type fakeProvisioner struct {
	called string
	err    error
}

func (f *fakeProvisioner) CreatePasswordUser(_ context.Context, email string) error {
	f.called = email
	return f.err
}

func TestCreateUser_GoogleDefault(t *testing.T) {
	store := &db.MockStore{CreatedUser: &models.User{ID: "1", Email: "a@b.c"}}
	fp := &fakeProvisioner{}
	req := httptest.NewRequest("POST", "/api/admin/users", bytes.NewBufferString(`{"email":"a@b.c"}`))
	rec := httptest.NewRecorder()
	CreateUser(store, fp).ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d", rec.Code)
	}
	if store.LastCreatedMethod != models.AuthGoogle {
		t.Fatalf("want google, got %q", store.LastCreatedMethod)
	}
	if fp.called != "" {
		t.Fatalf("google invite must not provision firebase, got %q", fp.called)
	}
}

func TestCreateUser_PasswordProvisions(t *testing.T) {
	store := &db.MockStore{CreatedUser: &models.User{ID: "1", Email: "a@b.c"}}
	fp := &fakeProvisioner{}
	req := httptest.NewRequest("POST", "/api/admin/users", bytes.NewBufferString(`{"email":"a@b.c","method":"password"}`))
	rec := httptest.NewRecorder()
	CreateUser(store, fp).ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d", rec.Code)
	}
	if store.LastCreatedMethod != models.AuthPassword {
		t.Fatalf("want password, got %q", store.LastCreatedMethod)
	}
	if fp.called != "a@b.c" {
		t.Fatalf("want firebase provision for a@b.c, got %q", fp.called)
	}
}

func TestCreateUser_PasswordEmailTaken(t *testing.T) {
	store := &db.MockStore{CreatedUser: &models.User{ID: "1"}}
	fp := &fakeProvisioner{err: ErrFirebaseEmailExists}
	req := httptest.NewRequest("POST", "/api/admin/users", bytes.NewBufferString(`{"email":"a@b.c","method":"password"}`))
	rec := httptest.NewRecorder()
	CreateUser(store, fp).ServeHTTP(rec, req)
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
	CreateUser(store, fp).ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d", rec.Code)
	}
}

func TestCreateUser_InvalidMethod(t *testing.T) {
	store := &db.MockStore{}
	fp := &fakeProvisioner{}
	req := httptest.NewRequest("POST", "/api/admin/users", bytes.NewBufferString(`{"email":"a@b.c","method":"sms"}`))
	rec := httptest.NewRecorder()
	CreateUser(store, fp).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}
