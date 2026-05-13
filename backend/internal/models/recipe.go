package models

import "time"

// Ingredient is the parsed form stored in JSONB.
// Amount is numeric (0 if unparseable). Display is the original string.
type Ingredient struct {
	Amount  float64 `json:"amount"`
	Unit    string  `json:"unit"`
	Display string  `json:"display"`
	Name    string  `json:"name"`
}

// RecipeListItem is returned by GET /api/recipes (no ingredients/steps).
type RecipeListItem struct {
	Slug            string  `json:"slug"`
	Title           string  `json:"title"`
	CategorySlug    string  `json:"category_slug"`
	TimeMinutes     int     `json:"time_minutes"`
	Servings        string  `json:"servings"`
	ImageURL        string  `json:"image_url"`
	ImageBlurhash   string  `json:"image_blurhash"`
	IngredientNames string  `json:"ingredient_names,omitempty"`
	OwnerID         *string `json:"owner_id,omitempty"`
	OwnerEmail      string  `json:"owner_email,omitempty"`
	CreatedBy       *string `json:"created_by,omitempty"`
	IsMine          bool    `json:"is_mine,omitempty"`
}

// Recipe is the full record returned by GET /api/recipes/{slug}.
type Recipe struct {
	Slug          string       `json:"slug"`
	Title         string       `json:"title"`
	CategorySlug  string       `json:"category_slug"`
	TimeMinutes   int          `json:"time_minutes"`
	Servings      string       `json:"servings"`
	Ingredients   []Ingredient `json:"ingredients"`
	Steps         []string     `json:"steps"`
	Notes         string       `json:"notes"`
	ImageURL      string       `json:"image_url"`
	ImageBlurhash string       `json:"image_blurhash"`
	OwnerID       *string      `json:"owner_id,omitempty"`
	OwnerEmail    string       `json:"owner_email,omitempty"`
	CreatedBy     *string      `json:"created_by,omitempty"`
	IsMine        bool         `json:"is_mine,omitempty"`
	CreatedAt     time.Time    `json:"created_at"`
	UpdatedAt     time.Time    `json:"updated_at"`
}
