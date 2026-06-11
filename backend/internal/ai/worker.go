package ai

import (
	"context"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"backend/internal/db"
	"backend/internal/models"
)

type WorkerOpts struct {
	Workers          int
	MaxAttempts      int
	PollEvery        time.Duration
	Resolve          func(provider, model string) (Extractor, error)
	ResolveNutrition func(provider, model string) (NutritionEstimator, error)
	Categories       func(ctx context.Context) ([]string, error)
	// RevalidateRecipe busts the frontend's cached page for a recipe whose
	// public payload changed in the background (nutrition jobs finish after
	// the admin's request, possibly after their tab is closed). Optional;
	// nil disables. Implementations must be best-effort and non-blocking-ish
	// (bounded timeout) — a failed revalidation must never fail the job.
	RevalidateRecipe func(ctx context.Context, slug string)
}

type WorkerPool struct {
	store db.Store
	opts  WorkerOpts
}

func NewWorkerPool(store db.Store, opts WorkerOpts) *WorkerPool {
	if opts.Workers == 0 {
		opts.Workers = 2
	}
	if opts.MaxAttempts == 0 {
		opts.MaxAttempts = 3
	}
	if opts.PollEvery == 0 {
		opts.PollEvery = time.Second
	}
	if opts.Resolve == nil {
		opts.Resolve = func(provider, model string) (Extractor, error) {
			return Get(provider + ":" + model)
		}
	}
	if opts.ResolveNutrition == nil {
		opts.ResolveNutrition = func(provider, model string) (NutritionEstimator, error) {
			return GetNutrition(provider + ":" + model)
		}
	}
	return &WorkerPool{store: store, opts: opts}
}

// Start launches the worker goroutines and a cleanup ticker.
// Blocks until ctx is canceled.
func (p *WorkerPool) Start(ctx context.Context) error {
	if err := p.store.ResetOrphanedAIJobs(ctx, p.opts.MaxAttempts); err != nil {
		log.Printf("worker: orphan reset failed: %v", err)
	}
	for i := 0; i < p.opts.Workers; i++ {
		go p.loop(ctx)
	}
	go p.cleanupLoop(ctx)
	<-ctx.Done()
	return ctx.Err()
}

func (p *WorkerPool) loop(ctx context.Context) {
	t := time.NewTicker(p.opts.PollEvery)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := p.RunOnce(ctx); err != nil {
				log.Printf("worker: %v", err)
			}
		}
	}
}

// RunOnce claims at most one job and processes it. Used by tests; safe to call repeatedly.
func (p *WorkerPool) RunOnce(ctx context.Context) error {
	job, err := p.store.ClaimNextAIJob(ctx)
	if err != nil {
		return err
	}
	if job == nil {
		return nil
	}
	p.handle(ctx, job)
	return nil
}

func (p *WorkerPool) handle(ctx context.Context, job *models.AIJob) {
	if job.Kind == "nutrition" {
		p.handleNutrition(ctx, job)
		return
	}

	extractor, err := p.opts.Resolve(job.Provider, job.Model)
	if err != nil {
		_ = p.store.SetAIJobFailed(ctx, job.ID, "model not available: "+err.Error())
		return
	}

	var cats []string
	if p.opts.Categories != nil {
		cats, _ = p.opts.Categories(ctx)
	}

	start := time.Now()
	res, err := extractor.Extract(ctx, Request{
		ImageURLs:  job.ImageURLs,
		Locale:     "de",
		Categories: cats,
	})
	if err != nil {
		if job.Attempts < p.opts.MaxAttempts {
			log.Printf("worker: job=%s attempt=%d retrying: %v", job.ID, job.Attempts, err)
			_ = p.store.RequeueAIJob(ctx, job.ID)
			return
		}
		_ = p.store.SetAIJobFailed(ctx, job.ID, err.Error())
		return
	}
	cost := CostUSD(extractor.Provider(), extractor.Model(), res.InputTokens, res.OutputTokens)
	log.Printf("ai: provider=%s model=%s job=%s user=%s latency_ms=%d in_tokens=%d out_tokens=%d cost_usd=%.5f",
		extractor.Provider(), extractor.Model(), job.ID, job.UserID,
		time.Since(start).Milliseconds(), res.InputTokens, res.OutputTokens, cost)

	_ = p.store.SetAIJobReady(ctx, job.ID, toRecipePayload(res), res.InputTokens, res.OutputTokens, cost)
}

func (p *WorkerPool) handleNutrition(ctx context.Context, job *models.AIJob) {
	if job.RecipeSlug == nil {
		_ = p.store.SetAIJobFailed(ctx, job.ID, "nutrition job missing recipe_slug")
		return
	}
	recipe, err := p.store.GetRecipeBySlug(ctx, *job.RecipeSlug)
	if err != nil {
		_ = p.store.SetAIJobFailed(ctx, job.ID, "load recipe: "+err.Error())
		return
	}
	if recipe == nil {
		_ = p.store.SetAIJobFailed(ctx, job.ID, "recipe not found: "+*job.RecipeSlug)
		return
	}
	est, err := p.opts.ResolveNutrition(job.Provider, job.Model)
	if err != nil {
		_ = p.store.SetAIJobFailed(ctx, job.ID, "model not available: "+err.Error())
		return
	}
	res, err := est.Estimate(ctx, *recipe)
	if err != nil {
		if job.Attempts < p.opts.MaxAttempts {
			_ = p.store.RequeueAIJob(ctx, job.ID)
			return
		}
		_ = p.store.SetAIJobFailed(ctx, job.ID, err.Error())
		return
	}
	cost := CostUSD(est.Provider(), est.Model(), res.InputTokens, res.OutputTokens)
	if err := p.store.SetRecipeNutrition(ctx, models.RecipeNutrition{
		RecipeSlug: *job.RecipeSlug, PerRecipe: res.PerRecipe, PerServing: res.PerServing,
		ServingsUsed: res.ServingsUsed, LineItems: res.LineItems, Model: est.Model(),
		InputTokens: res.InputTokens, OutputTokens: res.OutputTokens, CostUSD: cost,
	}); err != nil {
		_ = p.store.SetAIJobFailed(ctx, job.ID, "store nutrition: "+err.Error())
		return
	}
	// The recipe's public payload (per-serving nutrition) just changed —
	// bust its cached page. The admin tab also revalidates on poll success,
	// but it may already be closed when the job finishes.
	if p.opts.RevalidateRecipe != nil {
		p.opts.RevalidateRecipe(ctx, *job.RecipeSlug)
	}
	_ = p.store.SetAIJobReady(ctx, job.ID,
		map[string]any{"per_recipe": res.PerRecipe}, res.InputTokens, res.OutputTokens, cost)
}

// toRecipePayload converts the AI's prompt-shape Result into the partial
// Recipe shape the frontend RecipeForm expects (category_slug, time_minutes,
// servings as text, ingredients with display/name/amount/unit). The frontend
// review screen consumes this directly.
func toRecipePayload(res Result) map[string]any {
	ingredients := make([]map[string]any, 0, len(res.Ingredients))
	for _, ing := range res.Ingredients {
		ingredients = append(ingredients, map[string]any{
			"display": ing.Amount,
			"name":    ing.Name,
			"amount":  0,
			"unit":    "",
		})
	}
	servings := ""
	if res.Servings > 0 {
		if res.Servings == 1 {
			servings = "1 Person"
		} else {
			servings = fmt.Sprintf("%d Personen", res.Servings)
		}
	}
	return map[string]any{
		"title":         res.Title,
		"category_slug": res.Category,
		"time_minutes":  parseTimeToMinutes(res.Time),
		"servings":      servings,
		"ingredients":   ingredients,
		"steps":         res.Steps,
		"notes":         res.Notes,
	}
}

// parseTimeToMinutes parses German duration strings into minutes.
// Examples: "30 Minuten" → 30, "1 Stunde 10 Minuten" → 70, "1,5 Stunden" → 90,
// "2 Stunden" → 120. Returns 0 if nothing recognised.
var (
	timeHoursRe   = regexp.MustCompile(`(\d+(?:[.,]\d+)?)\s*(?:Stunde|Stunden|Std|h)`)
	timeMinutesRe = regexp.MustCompile(`(\d+(?:[.,]\d+)?)\s*(?:Minute|Minuten|Min|min)`)
)

func parseTimeToMinutes(s string) int {
	total := 0.0
	if m := timeHoursRe.FindStringSubmatch(s); len(m) == 2 {
		if v, err := strconv.ParseFloat(strings.ReplaceAll(m[1], ",", "."), 64); err == nil {
			total += v * 60
		}
	}
	if m := timeMinutesRe.FindStringSubmatch(s); len(m) == 2 {
		if v, err := strconv.ParseFloat(strings.ReplaceAll(m[1], ",", "."), 64); err == nil {
			total += v
		}
	}
	return int(total)
}

func (p *WorkerPool) cleanupLoop(ctx context.Context) {
	t := time.NewTicker(6 * time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			cutoff := time.Now().AddDate(0, 0, -30)
			n, err := p.store.DeleteOldAIJobs(ctx, cutoff)
			if err != nil {
				log.Printf("ai-cleanup: %v", err)
			} else if n > 0 {
				log.Printf("ai-cleanup: deleted %d old jobs", n)
			}
		}
	}
}
