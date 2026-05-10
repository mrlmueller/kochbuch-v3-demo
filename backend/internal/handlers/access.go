package handlers

import (
	"context"

	"backend/internal/db"
	"backend/internal/models"
)

// recipeAccess fetches a recipe and decides if the caller can edit it.
// Returns (recipe, canEdit, hidden, err).
//
// hidden=true means the caller should see a 404 (the recipe either
// doesn't exist OR exists but they aren't allowed to know that).
func recipeAccess(ctx context.Context, store db.Store, slug string, user *models.User) (*models.Recipe, bool, bool, error) {
	if user == nil {
		return nil, false, true, nil
	}
	r, err := store.GetRecipeBySlug(ctx, slug)
	if err != nil {
		return nil, false, false, err
	}
	if r == nil {
		return nil, false, true, nil
	}
	isAdmin := user.Role == models.RoleAdmin
	isGlobal := r.OwnerID == nil
	isOwner := r.OwnerID != nil && *r.OwnerID == user.ID

	switch {
	case isAdmin:
		return r, true, false, nil
	case isGlobal:
		return r, false, false, nil
	case isOwner:
		return r, true, false, nil
	default:
		return nil, false, true, nil
	}
}
