package handlers

import (
	"encoding/json"
	"net/http"

	"backend/internal/db"
	mw "backend/internal/middleware"
	"backend/internal/models"
	"github.com/go-chi/chi/v5"
)

type listRecipesResponse struct {
	Items []models.RecipeListItem `json:"items"`
	Meta  listRecipesMeta         `json:"meta"`
}

type listRecipesMeta struct {
	MyRecipeCount int `json:"my_recipe_count"`
}

func ListRecipes(s db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := mw.UserFromContext(r.Context())
		if user == nil {
			// Internal-token (server-rendered) calls reach here without a user.
			// Return globals only, no meta.
			recipes, err := s.GetRecipes(r.Context(), db.RecipeFilter{
				Category: r.URL.Query().Get("category"),
				Query:    r.URL.Query().Get("q"),
			})
			if err != nil {
				jsonError(w, "internal server error", http.StatusInternalServerError)
				return
			}
			if recipes == nil {
				recipes = []models.RecipeListItem{}
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(listRecipesResponse{Items: recipes})
			return
		}

		f := db.RecipeFilter{
			Category: r.URL.Query().Get("category"),
			Query:    r.URL.Query().Get("q"),
			ViewerID: user.ID,
		}
		if r.URL.Query().Get("owner") == "me" {
			uid := user.ID
			f.OwnerID = &uid
		}
		recipes, err := s.GetRecipes(r.Context(), f)
		if err != nil {
			jsonError(w, "internal server error", http.StatusInternalServerError)
			return
		}
		if recipes == nil {
			recipes = []models.RecipeListItem{}
		}
		myCount, _ := s.CountUserRecipes(r.Context(), user.ID)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(listRecipesResponse{
			Items: recipes,
			Meta:  listRecipesMeta{MyRecipeCount: myCount},
		})
	}
}

func GetRecipe(s db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := mw.UserFromContext(r.Context())
		slug := chi.URLParam(r, "slug")

		// Internal-token calls (no user) get the recipe directly without
		// ownership filtering — the SSR layer fetches public globals only.
		if user == nil {
			recipe, err := s.GetRecipeBySlug(r.Context(), slug)
			if err != nil {
				jsonError(w, "internal server error", http.StatusInternalServerError)
				return
			}
			if recipe == nil || recipe.OwnerID != nil {
				jsonError(w, "not found", http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(recipe)
			return
		}

		recipe, _, hidden, err := recipeAccess(r.Context(), s, slug, user)
		if err != nil {
			jsonError(w, "internal server error", http.StatusInternalServerError)
			return
		}
		if hidden || recipe == nil {
			jsonError(w, "not found", http.StatusNotFound)
			return
		}
		if recipe.OwnerID != nil && *recipe.OwnerID == user.ID {
			recipe.IsMine = true
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(recipe)
	}
}
