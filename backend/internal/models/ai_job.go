package models

import "time"

type AIJobStatus string

const (
	AIJobQueued    AIJobStatus = "queued"
	AIJobRunning   AIJobStatus = "running"
	AIJobReady     AIJobStatus = "ready"
	AIJobFailed    AIJobStatus = "failed"
	AIJobCancelled AIJobStatus = "cancelled"
	AIJobConsumed  AIJobStatus = "consumed"
)

// AIJob is one image-to-recipe extraction job.
type AIJob struct {
	ID           string         `json:"id"`
	UserID       string         `json:"user_id"`
	Status       AIJobStatus    `json:"status"`
	Provider     string         `json:"provider"`
	Model        string         `json:"model"`
	ImageURLs    []string       `json:"image_urls"`
	Kind         string         `json:"kind"`
	RecipeSlug   *string        `json:"recipe_slug,omitempty"`
	RecipeJSON   map[string]any `json:"recipe_json,omitempty"`
	Error        string         `json:"error,omitempty"`
	Attempts     int            `json:"attempts"`
	InputTokens  int            `json:"input_tokens"`
	OutputTokens int            `json:"output_tokens"`
	CostUSD      float64        `json:"cost_usd"`
	CreatedAt    time.Time      `json:"created_at"`
	StartedAt    *time.Time     `json:"started_at,omitempty"`
	FinishedAt   *time.Time     `json:"finished_at,omitempty"`
}

// AIStats aggregates AI job usage across users and models. Returned by
// GET /api/admin/ai-stats for the admin Kosten page.
type AIStats struct {
	GeneratedAt time.Time           `json:"generated_at"`
	Totals      AIStatsBucket       `json:"totals"`
	Last7d      AIStatsBucket       `json:"last_7d"`
	Last30d     AIStatsBucket       `json:"last_30d"`
	ByKind      []AIStatsByKind     `json:"by_kind"`
	ByModel     []AIStatsByModel    `json:"by_model"`
	ByUser      []AIStatsByUser     `json:"by_user"`
	Recent      []AIStatsRecentItem `json:"recent"`
}

// AIStatsByKind breaks cost down by task kind (e.g. extraction vs nutrition).
type AIStatsByKind struct {
	Kind         string  `json:"kind"`
	Jobs         int     `json:"jobs"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	CostUSD      float64 `json:"cost_usd"`
}

type AIStatsBucket struct {
	Jobs         int     `json:"jobs"`
	SuccessJobs  int     `json:"success_jobs"`
	FailedJobs   int     `json:"failed_jobs"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	CostUSD      float64 `json:"cost_usd"`
}

type AIStatsByModel struct {
	Provider     string  `json:"provider"`
	Model        string  `json:"model"`
	Jobs         int     `json:"jobs"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	CostUSD      float64 `json:"cost_usd"`
}

type AIStatsByUser struct {
	UserID     string  `json:"user_id"`
	Email      string  `json:"email"`
	Jobs       int     `json:"jobs"`
	CostUSD    float64 `json:"cost_usd"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
}

type AIStatsRecentItem struct {
	JobID        string    `json:"job_id"`
	UserEmail    string    `json:"user_email"`
	Kind         string    `json:"kind"`
	Provider     string    `json:"provider"`
	Model        string    `json:"model"`
	Status       string    `json:"status"`
	InputTokens  int       `json:"input_tokens"`
	OutputTokens int       `json:"output_tokens"`
	CostUSD      float64   `json:"cost_usd"`
	CreatedAt    time.Time `json:"created_at"`
}
