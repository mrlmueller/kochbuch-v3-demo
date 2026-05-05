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

func (s *PostgresStore) CreateRecipe(ctx context.Context, r models.Recipe) error {
	ingredientsJSON, _ := json.Marshal(r.Ingredients)
	stepsJSON, _ := json.Marshal(r.Steps)
	_, err := s.pool.Exec(ctx, `
		INSERT INTO recipes
		  (slug, title, category_slug, time_minutes, servings,
		   ingredients, steps, notes, image_url, image_blurhash)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		r.Slug, r.Title, r.CategorySlug, r.TimeMinutes, r.Servings,
		ingredientsJSON, stepsJSON, r.Notes, r.ImageURL, r.ImageBlurhash)
	return err
}

func (s *PostgresStore) UpdateRecipe(ctx context.Context, r models.Recipe) error {
	ingredientsJSON, _ := json.Marshal(r.Ingredients)
	stepsJSON, _ := json.Marshal(r.Steps)
	_, err := s.pool.Exec(ctx, `
		UPDATE recipes SET
		  title=$2, category_slug=$3, time_minutes=$4, servings=$5,
		  ingredients=$6, steps=$7, notes=$8, image_url=$9,
		  image_blurhash=$10, updated_at=now()
		WHERE slug=$1`,
		r.Slug, r.Title, r.CategorySlug, r.TimeMinutes, r.Servings,
		ingredientsJSON, stepsJSON, r.Notes, r.ImageURL, r.ImageBlurhash)
	return err
}

func (s *PostgresStore) DeleteRecipe(ctx context.Context, slug string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM recipes WHERE slug = $1`, slug)
	return err
}
