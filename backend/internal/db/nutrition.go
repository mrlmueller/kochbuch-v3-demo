package db

import (
	"context"
	"encoding/json"

	"backend/internal/models"
	"github.com/jackc/pgx/v5"
)

func (s *PostgresStore) IsRecipeConfirmed(ctx context.Context, slug string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx,
		`SELECT confirmed_at IS NOT NULL FROM recipes WHERE slug = $1`, slug).Scan(&ok)
	if err == pgx.ErrNoRows {
		return false, ErrRecipeNotFound
	}
	return ok, err
}

func (s *PostgresStore) CreateNutritionJob(ctx context.Context, userID, recipeSlug string) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO ai_jobs (user_id, status, provider, model, image_urls, kind, recipe_slug)
		VALUES ($1, 'queued', 'claude', 'claude-sonnet-4-6', '[]', 'nutrition', $2)
		RETURNING id`, userID, recipeSlug).Scan(&id)
	return id, err
}

func (s *PostgresStore) GetRecipeNutrition(ctx context.Context, slug string) (*models.RecipeNutrition, error) {
	var n models.RecipeNutrition
	var perR, perS, items []byte
	err := s.pool.QueryRow(ctx, `
		SELECT recipe_slug, per_recipe, per_serving, servings_used, line_items,
		       model, input_tokens, output_tokens, cost_usd, outdated, computed_at
		FROM recipe_nutrition WHERE recipe_slug = $1`, slug).
		Scan(&n.RecipeSlug, &perR, &perS, &n.ServingsUsed, &items,
			&n.Model, &n.InputTokens, &n.OutputTokens, &n.CostUSD, &n.Outdated, &n.ComputedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(perR, &n.PerRecipe)
	_ = json.Unmarshal(perS, &n.PerServing)
	_ = json.Unmarshal(items, &n.LineItems)
	return &n, nil
}

func (s *PostgresStore) SetRecipeNutrition(ctx context.Context, n models.RecipeNutrition) error {
	perR, _ := json.Marshal(n.PerRecipe)
	perS, _ := json.Marshal(n.PerServing)
	items, _ := json.Marshal(n.LineItems)
	_, err := s.pool.Exec(ctx, `
		INSERT INTO recipe_nutrition
		  (recipe_slug, per_recipe, per_serving, servings_used, line_items,
		   model, input_tokens, output_tokens, cost_usd, outdated, computed_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,now())
		ON CONFLICT (recipe_slug) DO UPDATE SET
		  per_recipe=$2, per_serving=$3, servings_used=$4, line_items=$5,
		  model=$6, input_tokens=$7, output_tokens=$8, cost_usd=$9,
		  outdated=false, computed_at=now()`,
		n.RecipeSlug, perR, perS, n.ServingsUsed, items,
		n.Model, n.InputTokens, n.OutputTokens, n.CostUSD)
	return err
}

func (s *PostgresStore) MarkNutritionOutdated(ctx context.Context, slug string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE recipe_nutrition SET outdated = true WHERE recipe_slug = $1`, slug)
	return err
}

func (s *PostgresStore) ListNutritionStatuses(ctx context.Context) (map[string]models.NutritionStatus, error) {
	rows, err := s.pool.Query(ctx, `SELECT recipe_slug, outdated FROM recipe_nutrition`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]models.NutritionStatus{}
	for rows.Next() {
		var slug string
		var outdated bool
		if err := rows.Scan(&slug, &outdated); err != nil {
			return nil, err
		}
		if outdated {
			out[slug] = models.NutritionOutdated
		} else {
			out[slug] = models.NutritionCurrent
		}
	}
	return out, rows.Err()
}
