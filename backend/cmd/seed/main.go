package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"path/filepath"

	"backend/internal/db"
	"backend/internal/models"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
	"github.com/joho/godotenv"
)

// flexString unmarshals JSON strings OR numbers into a Go string.
type flexString string

func (f *flexString) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		*f = flexString(s)
		return nil
	}
	var n json.Number
	if err := json.Unmarshal(data, &n); err == nil {
		*f = flexString(n.String())
		return nil
	}
	*f = ""
	return nil
}

// sourceRecipe matches the JSON shape of the export files.
// Newer recipes use _firestore_id as the slug; older ones have an explicit slug field.
type sourceRecipe struct {
	FirestoreID   string     `json:"_firestore_id"`
	Slug          string     `json:"slug"`
	Title         string     `json:"title"`
	Category      string     `json:"category"`
	Time          string     `json:"time"`
	Servings      flexString `json:"servings"`
	Notes         string     `json:"notes"`
	ImageURL      string     `json:"image_url"`
	ImageBlurhash string     `json:"image_blurhash"`
	Ingredients   []struct {
		Amount string `json:"amount"`
		Name   string `json:"name"`
	} `json:"ingredients"`
	Steps  []string `json:"steps"`
	Export struct {
		Image struct {
			Path string `json:"path"`
		} `json:"image"`
	} `json:"_export"`
}

func (r *sourceRecipe) slug() string {
	if r.Slug != "" {
		return r.Slug
	}
	return r.FirestoreID
}

type sourceCategory struct {
	Slug         string `json:"slug"`
	CategoryName string `json:"categoryName"`
	Description  string `json:"description"`
}

// Category accent colors by slug.
var categoryAccents = map[string]string{
	"hauptgerichte":           "#C2410C",
	"grundrezepte-und-saucen": "#5F7A4F",
	"backen-und-suesses":      "#9333EA",
	"snacks":                  "#1E5C8A",
}

func main() {
	_ = godotenv.Load(".env")

	ctx := context.Background()

	// Connect to DB
	pool, err := db.NewPool(ctx)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	// Init Cloudinary (optional — skip if credentials are not set)
	var cld *cloudinary.Cloudinary
	if os.Getenv("CLOUDINARY_CLOUD_NAME") != "" {
		cld, err = cloudinary.NewFromParams(
			os.Getenv("CLOUDINARY_CLOUD_NAME"),
			os.Getenv("CLOUDINARY_API_KEY"),
			os.Getenv("CLOUDINARY_API_SECRET"),
		)
		if err != nil {
			log.Fatalf("cloudinary init: %v", err)
		}
	} else {
		log.Println("CLOUDINARY_CLOUD_NAME not set — using source image_url as-is")
	}

	exportDir := "../kochbuch-data/recipes_export_20260505_160450"

	// 1. Seed categories
	catData, err := os.ReadFile(filepath.Join(exportDir, "categories.json"))
	if err != nil {
		log.Fatalf("read categories: %v", err)
	}
	var srcCats []sourceCategory
	if err := json.Unmarshal(catData, &srcCats); err != nil {
		log.Fatalf("parse categories: %v", err)
	}
	for _, sc := range srcCats {
		accent := categoryAccents[sc.Slug]
		if accent == "" {
			accent = "#888888"
		}
		_, err := pool.Exec(ctx, `
			INSERT INTO categories (slug, name, description, accent)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (slug) DO UPDATE
			  SET name=$2, description=$3, accent=$4`,
			sc.Slug, sc.CategoryName, sc.Description, accent)
		if err != nil {
			log.Fatalf("insert category %s: %v", sc.Slug, err)
		}
		log.Printf("category OK: %s", sc.Slug)
	}

	// 2. Seed recipes
	recipeFiles, err := filepath.Glob(filepath.Join(exportDir, "recipes", "*.json"))
	if err != nil {
		log.Fatalf("glob recipes: %v", err)
	}

	for _, f := range recipeFiles {
		data, err := os.ReadFile(f)
		if err != nil {
			log.Printf("WARN: read %s: %v", f, err)
			continue
		}
		var src sourceRecipe
		if err := json.Unmarshal(data, &src); err != nil {
			log.Printf("WARN: parse %s: %v", f, err)
			continue
		}

		slug := src.slug()
		if slug == "" {
			log.Printf("WARN: skipping %s — no slug", f)
			continue
		}

		// Upload image to Cloudinary, or fall back to source image_url
		imageURL := src.ImageURL
		if cld != nil && src.Export.Image.Path != "" {
			localPath := filepath.Join(exportDir, src.Export.Image.Path)
			result, err := cld.Upload.Upload(ctx, localPath, uploader.UploadParams{
				Folder:   "kochbuch",
				PublicID: slug,
			})
			if err != nil {
				log.Printf("WARN: cloudinary upload %s: %v — using source URL", slug, err)
			} else {
				imageURL = result.SecureURL
			}
		}

		// Parse ingredients
		ingredients := make([]models.Ingredient, 0, len(src.Ingredients))
		for _, si := range src.Ingredients {
			ingredients = append(ingredients, parseIngredient(si.Amount, si.Name))
		}

		// Serialize to JSONB
		ingredientsJSON, _ := json.Marshal(ingredients)
		stepsJSON, _ := json.Marshal(src.Steps)

		_, err = pool.Exec(ctx, `
			INSERT INTO recipes
			  (slug, title, category_slug, time_minutes, servings,
			   ingredients, steps, notes, image_url, image_blurhash)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			ON CONFLICT (slug) DO UPDATE
			  SET title=$2, category_slug=$3, time_minutes=$4, servings=$5,
			      ingredients=$6, steps=$7, notes=$8, image_url=$9,
			      image_blurhash=$10, updated_at=now()`,
			slug,
			src.Title,
			src.Category,
			parseTimeMinutes(src.Time),
			string(src.Servings),
			ingredientsJSON,
			stepsJSON,
			src.Notes,
			imageURL,
			src.ImageBlurhash,
		)
		if err != nil {
			log.Printf("WARN: insert %s: %v", slug, err)
			continue
		}
		log.Printf("recipe OK: %s → %s", slug, imageURL)
	}

	log.Println("seed complete")
}
