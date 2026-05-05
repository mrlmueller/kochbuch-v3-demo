package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/db"
	"backend/internal/handlers"
	"backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListCategories_returnsJSON(t *testing.T) {
	store := &db.MockStore{
		Categories: []models.Category{
			{Slug: "hauptgerichte", Name: "Hauptgerichte", Description: "desc", Accent: "#C2410C"},
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/categories", nil)
	w := httptest.NewRecorder()
	handlers.ListCategories(store)(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var got []models.Category
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	require.Len(t, got, 1)
	assert.Equal(t, "hauptgerichte", got[0].Slug)
}

func TestListCategories_storeError(t *testing.T) {
	store := &db.MockStore{Err: fmt.Errorf("db down")}

	req := httptest.NewRequest(http.MethodGet, "/api/categories", nil)
	w := httptest.NewRecorder()
	handlers.ListCategories(store)(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
}
