package backup

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"backend/internal/db"
	"backend/internal/models"
)

// Snapshot is the JSON shape committed to GitHub on each weekly backup.
// version lets future schema changes be detected at restore time.
type Snapshot struct {
	ExportedAt    time.Time         `json:"exported_at"`
	Version       int               `json:"version"`
	RecipeCount   int               `json:"recipe_count"`
	CategoryCount int               `json:"category_count"`
	Categories    []models.Category `json:"categories"`
	Recipes       []models.Recipe   `json:"recipes"`
}

// collectSnapshot fetches every recipe (with full ingredients/steps) and every
// category from the store. Iterates GetRecipeBySlug per slug so we don't need
// to extend the Store interface for one weekly job.
func collectSnapshot(ctx context.Context, store db.Store) (*Snapshot, error) {
	cats, err := store.GetCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("get categories: %w", err)
	}

	list, err := store.GetRecipes(ctx, db.RecipeFilter{Limit: 10_000})
	if err != nil {
		return nil, fmt.Errorf("list recipes: %w", err)
	}

	recipes := make([]models.Recipe, 0, len(list))
	for _, item := range list {
		full, err := store.GetRecipeBySlug(ctx, item.Slug)
		if err != nil {
			return nil, fmt.Errorf("get recipe %s: %w", item.Slug, err)
		}
		if full == nil {
			continue
		}
		recipes = append(recipes, *full)
	}

	return &Snapshot{
		ExportedAt:    time.Now().UTC(),
		Version:       1,
		RecipeCount:   len(recipes),
		CategoryCount: len(cats),
		Categories:    cats,
		Recipes:       recipes,
	}, nil
}

// marshalSnapshot returns the JSON bytes for a snapshot, with stable two-space
// indentation so commits diff cleanly in GitHub.
func marshalSnapshot(s *Snapshot) ([]byte, error) {
	return json.MarshalIndent(s, "", "  ")
}

// pushToGitHub PUTs a file to a private repo via the Contents API.
// owner/repo example: "mrlmueller/kochbuch-backups". token is a fine-grained
// PAT with contents:write on that repo only. Returns an error if the file
// already exists at that path (we never overwrite — date-based filenames make
// collisions extremely unlikely).
func pushToGitHub(ctx context.Context, owner, repo, token, filename string, content []byte, message string) error {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", owner, repo, filename)

	body, err := json.Marshal(map[string]string{
		"message": message,
		"content": base64.StdEncoding.EncodeToString(content),
		"branch":  "main",
	})
	if err != nil {
		return fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("github request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK {
		return nil
	}

	respBody, _ := io.ReadAll(resp.Body)
	return fmt.Errorf("github status %d: %s", resp.StatusCode, string(respBody))
}
