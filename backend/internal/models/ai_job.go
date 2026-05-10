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
	ID         string         `json:"id"`
	UserID     string         `json:"user_id"`
	Status     AIJobStatus    `json:"status"`
	Provider   string         `json:"provider"`
	Model      string         `json:"model"`
	ImageURLs  []string       `json:"image_urls"`
	RecipeJSON map[string]any `json:"recipe_json,omitempty"`
	Error      string         `json:"error,omitempty"`
	Attempts   int            `json:"attempts"`
	CreatedAt  time.Time      `json:"created_at"`
	StartedAt  *time.Time     `json:"started_at,omitempty"`
	FinishedAt *time.Time     `json:"finished_at,omitempty"`
}
