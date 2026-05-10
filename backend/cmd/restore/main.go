// restore reads a backup snapshot JSON (the shape written by
// internal/backup.go) and upserts every category and recipe into the database.
// Safe to re-run — uses ON CONFLICT … DO UPDATE everywhere.
//
//	cd backend && go run ./cmd/restore path/to/recipes.json
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"backend/internal/db"
	"backend/internal/models"

	"github.com/joho/godotenv"
)

type snapshot struct {
	ExportedAt    time.Time         `json:"exported_at"`
	Version       int               `json:"version"`
	RecipeCount   int               `json:"recipe_count"`
	CategoryCount int               `json:"category_count"`
	Categories    []models.Category `json:"categories"`
	Recipes       []models.Recipe   `json:"recipes"`
}

func main() {
	_ = godotenv.Load(".env")

	if len(os.Args) < 2 {
		log.Fatal("usage: go run ./cmd/restore <path-to-snapshot.json>")
	}
	path := os.Args[1]

	data, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("read %s: %v", path, err)
	}
	var snap snapshot
	if err := json.Unmarshal(data, &snap); err != nil {
		log.Fatalf("parse snapshot: %v", err)
	}
	log.Printf("snapshot exported_at=%s version=%d categories=%d recipes=%d",
		snap.ExportedAt.Format(time.RFC3339), snap.Version,
		len(snap.Categories), len(snap.Recipes))

	ctx := context.Background()
	pool, err := db.NewPool(ctx)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	// 1) Categories — upsert
	for _, c := range snap.Categories {
		_, err := pool.Exec(ctx, `
			INSERT INTO categories (slug, name, description, accent)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (slug) DO UPDATE SET
				name = EXCLUDED.name,
				description = EXCLUDED.description,
				accent = EXCLUDED.accent`,
			c.Slug, c.Name, c.Description, c.Accent)
		if err != nil {
			log.Fatalf("upsert category %s: %v", c.Slug, err)
		}
		log.Printf("category OK: %s", c.Slug)
	}

	// 2) Recipes — upsert. owner_id is preserved if the snapshot includes it;
	//    otherwise it stays NULL (global / admin-owned).
	for _, r := range snap.Recipes {
		ingredientsJSON, err := json.Marshal(r.Ingredients)
		if err != nil {
			log.Fatalf("marshal ingredients %s: %v", r.Slug, err)
		}
		stepsJSON, err := json.Marshal(r.Steps)
		if err != nil {
			log.Fatalf("marshal steps %s: %v", r.Slug, err)
		}

		created := r.CreatedAt
		if created.IsZero() {
			created = time.Now().UTC()
		}
		updated := r.UpdatedAt
		if updated.IsZero() {
			updated = created
		}
		_, err = pool.Exec(ctx, `
			INSERT INTO recipes
			  (slug, title, category_slug, time_minutes, servings,
			   ingredients, steps, notes, image_url, image_blurhash, owner_id,
			   created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
			ON CONFLICT (slug) DO UPDATE SET
				title          = EXCLUDED.title,
				category_slug  = EXCLUDED.category_slug,
				time_minutes   = EXCLUDED.time_minutes,
				servings       = EXCLUDED.servings,
				ingredients    = EXCLUDED.ingredients,
				steps          = EXCLUDED.steps,
				notes          = EXCLUDED.notes,
				image_url      = EXCLUDED.image_url,
				image_blurhash = EXCLUDED.image_blurhash,
				owner_id       = EXCLUDED.owner_id,
				updated_at     = now()`,
			r.Slug, r.Title, r.CategorySlug, r.TimeMinutes, r.Servings,
			ingredientsJSON, stepsJSON, r.Notes, r.ImageURL, r.ImageBlurhash, r.OwnerID,
			created, updated,
		)
		if err != nil {
			log.Fatalf("upsert recipe %s: %v", r.Slug, err)
		}
	}
	log.Printf("done: %d categories, %d recipes restored", len(snap.Categories), len(snap.Recipes))
	fmt.Println("OK")
}
