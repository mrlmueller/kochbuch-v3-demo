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

	// AdminView=true so user-private recipes (owner_id != NULL) are also
	// captured. Without it, the default visibility filter would only return
	// global/admin recipes and we'd silently drop user data from backups.
	list, err := store.GetRecipes(ctx, db.RecipeFilter{Limit: 10_000, AdminView: true})
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

// nextSundayUTC returns the next Sunday at 03:00 UTC strictly after `now`.
// Pure function — easy to unit test.
func nextSundayUTC(now time.Time) time.Time {
	now = now.UTC()
	target := time.Date(now.Year(), now.Month(), now.Day(), 3, 0, 0, 0, time.UTC)
	// Days until next Sunday (Sunday == 0): 7 if today's already past 03:00 UTC and is Sunday, else (7 - weekday) % 7
	daysUntilSunday := (7 - int(now.Weekday())) % 7
	if daysUntilSunday == 0 && !now.Before(target) {
		daysUntilSunday = 7
	}
	return target.AddDate(0, 0, daysUntilSunday)
}

// RunWeekly is the long-lived goroutine entry point. Skips silently if
// any env var is missing (so dev environments don't try to push). Errors
// during a backup are logged; the loop continues and tries again next
// Sunday.
func RunWeekly(ctx context.Context, store db.Store, owner, repo, token string) {
	if owner == "" || repo == "" || token == "" {
		fmt.Println("[backup] disabled: BACKUP_GITHUB_OWNER, BACKUP_GITHUB_REPO, or BACKUP_GITHUB_TOKEN not set")
		return
	}
	fmt.Printf("[backup] enabled, target=%s/%s, next run=%s\n", owner, repo, nextSundayUTC(time.Now()).Format(time.RFC3339))

	for {
		next := nextSundayUTC(time.Now())
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}

		if _, err := RunOnce(ctx, store, owner, repo, token, "weekly"); err != nil {
			fmt.Printf("[backup] run failed: %v\n", err)
		}
	}
}

// Result describes a successful backup run. Returned to the manual-trigger
// HTTP handler so the admin UI can show the file name + counts.
type Result struct {
	Filename      string `json:"filename"`
	RecipeCount   int    `json:"recipe_count"`
	CategoryCount int    `json:"category_count"`
	Bytes         int    `json:"bytes"`
}

// RunOnce collects, marshals, and pushes a snapshot. The kind argument is
// embedded in the commit message ("weekly" for the cron, "manual" for the
// admin button) so the GitHub history shows where each backup originated.
func RunOnce(ctx context.Context, store db.Store, owner, repo, token, kind string) (*Result, error) {
	snap, err := collectSnapshot(ctx, store)
	if err != nil {
		return nil, fmt.Errorf("collect: %w", err)
	}
	body, err := marshalSnapshot(snap)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	date := snap.ExportedAt.Format("2006-01-02")
	filename := fmt.Sprintf("recipes-%s.json", date)
	message := fmt.Sprintf("%s backup %s (%d recipes, %d categories)", kind, date, snap.RecipeCount, snap.CategoryCount)

	if err := pushToGitHub(ctx, owner, repo, token, filename, body, message); err != nil {
		return nil, fmt.Errorf("push: %w", err)
	}
	fmt.Printf("[backup] pushed %s (%s, %d recipes, %d categories, %d bytes)\n", filename, kind, snap.RecipeCount, snap.CategoryCount, len(body))
	return &Result{
		Filename:      filename,
		RecipeCount:   snap.RecipeCount,
		CategoryCount: snap.CategoryCount,
		Bytes:         len(body),
	}, nil
}
