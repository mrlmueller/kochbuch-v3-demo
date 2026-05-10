package handlers

import (
	"encoding/json"
	"net/http"

	"backend/internal/db"
	"backend/internal/models"
)

// GET /api/admin/recipes
// Admin-only. Returns ALL recipes with owner_email joined.
func ListAdminRecipes(s db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		f := db.RecipeFilter{
			Category:  r.URL.Query().Get("category"),
			Query:     r.URL.Query().Get("q"),
			AdminView: true,
		}
		switch r.URL.Query().Get("filter") {
		case "global":
			empty := ""
			f.OwnerID = &empty
			f.AdminView = false
		case "user":
			// Anything with a non-null owner_id. We approximate via AdminView=true
			// and a post-filter.
		}
		recipes, err := s.GetRecipes(r.Context(), f)
		if err != nil {
			jsonError(w, "internal server error", http.StatusInternalServerError)
			return
		}
		if r.URL.Query().Get("filter") == "user" {
			out := make([]models.RecipeListItem, 0, len(recipes))
			for _, x := range recipes {
				if x.OwnerID != nil {
					out = append(out, x)
				}
			}
			recipes = out
		}
		if recipes == nil {
			recipes = []models.RecipeListItem{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(recipes)
	}
}
