package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"backend/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func (s *PostgresStore) GetRecipes(ctx context.Context, f RecipeFilter) ([]models.RecipeListItem, error) {
	if f.Limit == 0 {
		f.Limit = 200
	}

	// Visibility (owner_id semantics — NULL = global, set = private):
	//   AdminView = true                 → no owner restriction
	//   OwnerID = &"" (sentinel)         → only global (NULL owner_id)
	//   OwnerID = &someID                → only that owner
	//   ViewerID set                     → owner_id IS NULL OR owner_id = ViewerID
	//   default                          → owner_id IS NULL
	var visibility string
	args := []any{f.Category, f.Query, f.Limit, f.Offset}
	switch {
	case f.AdminView:
		visibility = "TRUE"
	case f.OwnerID != nil && *f.OwnerID == "":
		visibility = "r.owner_id IS NULL"
	case f.OwnerID != nil:
		args = append(args, *f.OwnerID)
		visibility = fmt.Sprintf("r.owner_id = $%d", len(args))
	case f.ViewerID != "":
		args = append(args, f.ViewerID)
		visibility = fmt.Sprintf("(r.owner_id IS NULL OR r.owner_id = $%d)", len(args))
	default:
		visibility = "r.owner_id IS NULL"
	}

	// Optional creator filter (overlays the visibility above).
	creatorClause := ""
	if f.CreatorID != nil {
		args = append(args, *f.CreatorID)
		creatorClause = fmt.Sprintf(" AND r.created_by = $%d", len(args))
	}

	q := fmt.Sprintf(`
		SELECT r.slug, r.title, r.category_slug, r.time_minutes, r.servings,
		       r.image_url, r.image_blurhash,
		       COALESCE((SELECT string_agg(elem->>'name', ' ') FROM jsonb_array_elements(r.ingredients) AS elem), ''),
		       r.owner_id, COALESCE(u.email, ''),
		       r.created_by
		FROM recipes r
		LEFT JOIN users u ON u.id = r.owner_id
		WHERE ($1 = '' OR r.category_slug = $1)
		  AND ($2 = '' OR r.title ILIKE '%%' || $2 || '%%'
		               OR r.ingredients::text ILIKE '%%' || $2 || '%%')
		  AND %s%s
		ORDER BY r.title
		LIMIT $3 OFFSET $4`, visibility, creatorClause)

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]models.RecipeListItem, 0)
	for rows.Next() {
		var r models.RecipeListItem
		var ownerID, createdBy *string
		if err := rows.Scan(
			&r.Slug, &r.Title, &r.CategorySlug,
			&r.TimeMinutes, &r.Servings, &r.ImageURL, &r.ImageBlurhash,
			&r.IngredientNames,
			&ownerID, &r.OwnerEmail, &createdBy,
		); err != nil {
			return nil, err
		}
		r.OwnerID = ownerID
		r.CreatedBy = createdBy
		if f.ViewerID != "" && createdBy != nil && *createdBy == f.ViewerID {
			r.IsMine = true
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *PostgresStore) GetRecipeBySlug(ctx context.Context, slug string) (*models.Recipe, error) {
	var r models.Recipe
	var ingredientsJSON, stepsJSON []byte
	var ownerID, createdBy *string
	var ownerEmail string

	err := s.pool.QueryRow(ctx, `
		SELECT r.slug, r.title, r.category_slug, r.time_minutes, r.servings,
		       r.ingredients, r.steps, r.notes, r.image_url, r.image_blurhash,
		       r.owner_id, COALESCE(u.email, ''), r.created_by,
		       r.created_at, r.updated_at
		FROM recipes r
		LEFT JOIN users u ON u.id = r.owner_id
		WHERE r.slug = $1`, slug).
		Scan(
			&r.Slug, &r.Title, &r.CategorySlug,
			&r.TimeMinutes, &r.Servings,
			&ingredientsJSON, &stepsJSON,
			&r.Notes, &r.ImageURL, &r.ImageBlurhash,
			&ownerID, &ownerEmail, &createdBy,
			&r.CreatedAt, &r.UpdatedAt,
		)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	r.OwnerID = ownerID
	r.OwnerEmail = ownerEmail
	r.CreatedBy = createdBy
	if err := json.Unmarshal(ingredientsJSON, &r.Ingredients); err != nil {
		return nil, fmt.Errorf("unmarshal ingredients: %w", err)
	}
	if err := json.Unmarshal(stepsJSON, &r.Steps); err != nil {
		return nil, fmt.Errorf("unmarshal steps: %w", err)
	}

	// Per-serving nutrition for the public payload (per-serving only).
	var perS []byte
	var outdated bool
	err = s.pool.QueryRow(ctx,
		`SELECT per_serving, outdated FROM recipe_nutrition WHERE recipe_slug = $1`, slug).
		Scan(&perS, &outdated)
	if err == nil {
		var pn models.PublicNutrition
		if json.Unmarshal(perS, &pn.PerServing) == nil {
			pn.Outdated = outdated
			r.Nutrition = &pn
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	return &r, nil
}

// CountUserRecipes counts recipes the user personally added (created_by),
// regardless of whether the recipe is global or private. This is what powers
// the "Meine Rezepte" chip.
func (s *PostgresStore) CountUserRecipes(ctx context.Context, userID string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM recipes WHERE created_by = $1`, userID).Scan(&n)
	return n, err
}

func (s *PostgresStore) CreateRecipe(ctx context.Context, r models.Recipe) (string, error) {
	ingredientsJSON, _ := json.Marshal(r.Ingredients)
	stepsJSON, _ := json.Marshal(r.Steps)

	base := r.Slug
	if base == "" {
		base = "rezept"
	}
	base = strings.TrimRight(base, "-")

	for i := 0; i < 100; i++ {
		candidate := base
		if i > 0 {
			candidate = fmt.Sprintf("%s-%d", base, i+1)
		}
		_, err := s.pool.Exec(ctx, `
			INSERT INTO recipes
			  (slug, title, category_slug, time_minutes, servings,
			   ingredients, steps, notes, image_url, image_blurhash, owner_id, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
			candidate, r.Title, r.CategorySlug, r.TimeMinutes, r.Servings,
			ingredientsJSON, stepsJSON, r.Notes, r.ImageURL, r.ImageBlurhash, r.OwnerID, r.CreatedBy)
		if err == nil {
			return candidate, nil
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && strings.Contains(pgErr.Message, "recipes_pkey") {
			continue
		}
		return "", err
	}
	return "", fmt.Errorf("slug %q is taken (tried up to suffix -100)", base)
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

// ErrRecipeNotFound is returned by recipe writes that target a slug with no row.
var ErrRecipeNotFound = errors.New("recipe not found")

// ListConfirmedSlugs returns the slugs of all hand-confirmed (calibrated)
// recipes. Used by the admin-only status endpoint; never exposed publicly.
func (s *PostgresStore) ListConfirmedSlugs(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT slug FROM recipes WHERE confirmed_at IS NOT NULL ORDER BY slug`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err != nil {
			return nil, err
		}
		out = append(out, slug)
	}
	return out, rows.Err()
}

// SetRecipeConfirmed sets confirmed_at to now() (confirmed=true) or NULL
// (confirmed=false). Returns ErrRecipeNotFound if the slug doesn't exist.
func (s *PostgresStore) SetRecipeConfirmed(ctx context.Context, slug string, confirmed bool) error {
	var (
		tag pgconn.CommandTag
		err error
	)
	if confirmed {
		tag, err = s.pool.Exec(ctx, `UPDATE recipes SET confirmed_at = now() WHERE slug = $1`, slug)
	} else {
		tag, err = s.pool.Exec(ctx, `UPDATE recipes SET confirmed_at = NULL WHERE slug = $1`, slug)
	}
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrRecipeNotFound
	}
	return nil
}
