package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"backend/internal/cloudinary"
	"backend/internal/db"
	mw "backend/internal/middleware"
	"backend/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// POST /api/recipes
//
// Authed users (any role) may create recipes:
//   - Admin → recipe is global (owner_id = NULL)
//   - User  → owner_id = caller's user id
func CreateRecipe(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := mw.UserFromContext(r.Context())
		if user == nil {
			jsonError(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var recipe models.Recipe
		if err := json.NewDecoder(r.Body).Decode(&recipe); err != nil {
			jsonError(w, "Ungültige Anfrage", http.StatusBadRequest)
			return
		}
		if recipe.Title == "" {
			jsonError(w, "Titel ist erforderlich.", http.StatusBadRequest)
			return
		}
		if user.Role == models.RoleAdmin {
			recipe.OwnerID = nil // admin recipes are globally visible
		} else {
			uid := user.ID
			recipe.OwnerID = &uid // user recipes are private to the user
		}
		// created_by always records who actually clicked Save, regardless
		// of role — this is what powers Bearbeiten/Löschen on the detail
		// page and the "Meine Rezepte" filter.
		creator := user.ID
		recipe.CreatedBy = &creator
		// Always normalize the slug server-side — never trust the client-supplied
		// value. slugify() reduces it to [a-z0-9-], so a crafted slug can't carry
		// path/scheme/control characters into URLs, cache tags, or storage keys.
		recipe.Slug = slugify(recipe.Slug)
		if recipe.Slug == "" {
			recipe.Slug = slugify(recipe.Title)
		}
		finalSlug, err := store.CreateRecipe(r.Context(), recipe)
		if err != nil {
			log.Printf("CreateRecipe %q: %v", recipe.Slug, err)
			writeDbError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"slug": finalSlug})
	}
}

// PUT /api/recipes/{slug}
func UpdateRecipe(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := mw.UserFromContext(r.Context())
		slug := chi.URLParam(r, "slug")
		existing, canEdit, hidden, err := recipeAccess(r.Context(), store, slug, user)
		if err != nil {
			writeDbError(w, err)
			return
		}
		if hidden {
			jsonError(w, "Rezept nicht gefunden.", http.StatusNotFound)
			return
		}
		if !canEdit {
			jsonError(w, "Keine Berechtigung.", http.StatusForbidden)
			return
		}

		var recipe models.Recipe
		if err := json.NewDecoder(r.Body).Decode(&recipe); err != nil {
			jsonError(w, "Ungültige Anfrage", http.StatusBadRequest)
			return
		}
		recipe.Slug = slug
		// Preserve ownership across edits.
		recipe.OwnerID = existing.OwnerID
		if err := store.UpdateRecipe(r.Context(), recipe); err != nil {
			log.Printf("UpdateRecipe %q: %v", slug, err)
			writeDbError(w, err)
			return
		}
		// Best-effort: mark nutrition outdated when the recipe changes.
		// No row in recipe_nutrition is a silent no-op.
		_ = store.MarkNutritionOutdated(r.Context(), slug)
		// If the image was replaced or cleared, clean up the previous one.
		if existing.ImageURL != "" && existing.ImageURL != recipe.ImageURL {
			cleanupCloudinaryAsync(store, slug, existing.ImageURL)
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// cleanupCloudinaryAsync fires a Cloudinary destroy in the background so
// the caller's request isn't blocked by the upstream round-trip. Detached
// from the request context for the same reason.
//
// It first confirms no other recipe still references the image. A user can set
// their recipe's image_url to any URL, including another recipe's image; without
// this guard, editing/deleting their own recipe would destroy the shared asset.
// We fail closed: if the in-use check errors, we skip the delete (an orphaned
// asset is harmless; deleting an in-use one is not).
func cleanupCloudinaryAsync(store db.Store, slug, imageURL string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		inUse, err := store.ImageURLInUse(ctx, imageURL)
		if err != nil {
			log.Printf("cloudinary cleanup %q: skip (in-use check failed: %v)", slug, err)
			return
		}
		if inUse {
			log.Printf("cloudinary cleanup %q: skip (image still referenced by another recipe)", slug)
			return
		}
		if err := cloudinary.DeleteImageFromURL(ctx, imageURL); err != nil {
			log.Printf("cloudinary cleanup %q: %v", slug, err)
		}
	}()
}

// DELETE /api/recipes/{slug}
func DeleteRecipe(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := mw.UserFromContext(r.Context())
		slug := chi.URLParam(r, "slug")
		existing, canEdit, hidden, err := recipeAccess(r.Context(), store, slug, user)
		if err != nil {
			writeDbError(w, err)
			return
		}
		if hidden {
			jsonError(w, "Rezept nicht gefunden.", http.StatusNotFound)
			return
		}
		if !canEdit {
			jsonError(w, "Keine Berechtigung.", http.StatusForbidden)
			return
		}
		if err := store.DeleteRecipe(r.Context(), slug); err != nil {
			log.Printf("DeleteRecipe %q: %v", slug, err)
			writeDbError(w, err)
			return
		}
		if existing != nil && existing.ImageURL != "" {
			cleanupCloudinaryAsync(store, slug, existing.ImageURL)
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func writeDbError(w http.ResponseWriter, err error) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			jsonError(w, "Ein Rezept mit diesem Slug existiert bereits.", http.StatusConflict)
			return
		case "23503":
			jsonError(w, "Die gewählte Kategorie existiert nicht.", http.StatusBadRequest)
			return
		case "23502":
			jsonError(w, "Pflichtfeld fehlt: "+pgErr.ColumnName, http.StatusBadRequest)
			return
		}
	}
	jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func slugify(s string) string {
	s = strings.ToLower(s)
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else if r == ' ' || r == '-' {
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}
