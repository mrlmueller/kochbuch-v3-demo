package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"backend/internal/db"
	"backend/internal/handlers"
	"backend/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListRecipeConfirmations_returnsConfirmedSlugs(t *testing.T) {
	store := &db.MockStore{ConfirmedSlugs: []string{"bolognese", "lasagne"}}
	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: "a1", Role: models.RoleAdmin}))
	r.Get("/api/admin/recipes/status", handlers.ListRecipeConfirmations(store))

	req := httptest.NewRequest(http.MethodGet, "/api/admin/recipes/status", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Confirmed []string `json:"confirmed"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, []string{"bolognese", "lasagne"}, resp.Confirmed)
}

func TestListRecipeConfirmations_empty_returnsEmptyArray(t *testing.T) {
	store := &db.MockStore{ConfirmedSlugs: nil}
	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: "a1", Role: models.RoleAdmin}))
	r.Get("/api/admin/recipes/status", handlers.ListRecipeConfirmations(store))

	req := httptest.NewRequest(http.MethodGet, "/api/admin/recipes/status", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"confirmed":[]}`, w.Body.String())
}

func TestSetRecipeConfirmed_setsTrue(t *testing.T) {
	store := &db.MockStore{}
	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: "a1", Role: models.RoleAdmin}))
	r.Patch("/api/admin/recipes/{slug}/confirm", handlers.SetRecipeConfirmed(store))

	req := httptest.NewRequest(http.MethodPatch, "/api/admin/recipes/bolognese/confirm", strings.NewReader(`{"confirmed":true}`))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "bolognese", store.LastConfirmSlug)
	assert.True(t, store.LastConfirmValue)
}

func TestSetRecipeConfirmed_clearsFalse(t *testing.T) {
	store := &db.MockStore{}
	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: "a1", Role: models.RoleAdmin}))
	r.Patch("/api/admin/recipes/{slug}/confirm", handlers.SetRecipeConfirmed(store))

	req := httptest.NewRequest(http.MethodPatch, "/api/admin/recipes/bolognese/confirm", strings.NewReader(`{"confirmed":false}`))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "bolognese", store.LastConfirmSlug)
	assert.False(t, store.LastConfirmValue)
}

func TestSetRecipeConfirmed_notFound_404(t *testing.T) {
	store := &db.MockStore{ConfirmErr: db.ErrRecipeNotFound}
	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: "a1", Role: models.RoleAdmin}))
	r.Patch("/api/admin/recipes/{slug}/confirm", handlers.SetRecipeConfirmed(store))

	req := httptest.NewRequest(http.MethodPatch, "/api/admin/recipes/ghost/confirm", strings.NewReader(`{"confirmed":true}`))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestSetRecipeConfirmed_badBody_400(t *testing.T) {
	store := &db.MockStore{}
	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: "a1", Role: models.RoleAdmin}))
	r.Patch("/api/admin/recipes/{slug}/confirm", handlers.SetRecipeConfirmed(store))

	req := httptest.NewRequest(http.MethodPatch, "/api/admin/recipes/bolognese/confirm", strings.NewReader(`not json`))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}
