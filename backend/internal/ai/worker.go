package ai

import (
	"context"
	"log"
	"time"

	"backend/internal/db"
	"backend/internal/models"
)

type WorkerOpts struct {
	Workers     int
	MaxAttempts int
	PollEvery   time.Duration
	Resolve     func(provider, model string) (Extractor, error)
	Categories  func(ctx context.Context) ([]string, error)
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

	payload := map[string]any{
		"title":         res.Title,
		"category_slug": res.CategorySlug,
		"time_minutes":  res.TimeMinutes,
		"servings":      res.Servings,
		"ingredients":   res.Ingredients,
		"steps":         res.Steps,
		"notes":         res.Notes,
		"confidence":    res.Confidence,
	}
	_ = p.store.SetAIJobReady(ctx, job.ID, payload)
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
