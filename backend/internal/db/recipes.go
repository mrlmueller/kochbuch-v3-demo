package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"backend/internal/models"
	"github.com/jackc/pgx/v5"
)

func (s *PostgresStore) GetRecipes(ctx context.Context, f RecipeFilter) ([]models.RecipeListItem, error) {
	if f.Limit == 0 {
		f.Limit = 200
	}
	rows, err := s.pool.Query(ctx, `
		SELECT slug, title, category_slug, time_minutes, servings, image_url, image_blurhash
		FROM recipes
		WHERE ($1 = '' OR category_slug = $1)
		  AND ($2 = '' OR title ILIKE '%' || $2 || '%'
		                OR ingredients::text ILIKE '%' || $2 || '%')
		ORDER BY title
		LIMIT $3 OFFSET $4`,
		f.Category, f.Query, f.Limit, f.Offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	recipes := make([]models.RecipeListItem, 0)
	for rows.Next() {
		var r models.RecipeListItem
		if err := rows.Scan(
			&r.Slug, &r.Title, &r.CategorySlug,
			&r.TimeMinutes, &r.Servings, &r.ImageURL, &r.ImageBlurhash,
		); err != nil {
			return nil, err
		}
		recipes = append(recipes, r)
	}
	return recipes, rows.Err()
}

func (s *PostgresStore) GetRecipeBySlug(ctx context.Context, slug string) (*models.Recipe, error) {
	var r models.Recipe
	var ingredientsJSON, stepsJSON []byte

	err := s.pool.QueryRow(ctx, `
		SELECT slug, title, category_slug, time_minutes, servings,
		       ingredients, steps, notes, image_url, image_blurhash,
		       created_at, updated_at
		FROM recipes WHERE slug = $1`, slug).
		Scan(
			&r.Slug, &r.Title, &r.CategorySlug,
			&r.TimeMinutes, &r.Servings,
			&ingredientsJSON, &stepsJSON,
			&r.Notes, &r.ImageURL, &r.ImageBlurhash,
			&r.CreatedAt, &r.UpdatedAt,
		)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if err := json.Unmarshal(ingredientsJSON, &r.Ingredients); err != nil {
		return nil, fmt.Errorf("unmarshal ingredients: %w", err)
	}
	if err := json.Unmarshal(stepsJSON, &r.Steps); err != nil {
		return nil, fmt.Errorf("unmarshal steps: %w", err)
	}
	return &r, nil
}
