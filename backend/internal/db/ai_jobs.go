package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"backend/internal/models"
	"github.com/jackc/pgx/v5"
)

var (
	ErrJobLimitPerUser = errors.New("per-user active limit reached")
	ErrJobLimitGlobal  = errors.New("global queue full")
	ErrJobLimitDaily   = errors.New("daily limit reached")
)

func (s *PostgresStore) CreateAIJob(
	ctx context.Context, j models.AIJob,
	perUserActiveCap, globalActiveCap, dailyCap int,
) (string, error) {
	imgs, err := json.Marshal(j.ImageURLs)
	if err != nil {
		return "", err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var n int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM ai_jobs
		WHERE user_id = $1 AND status IN ('queued','running')`, j.UserID).Scan(&n); err != nil {
		return "", err
	}
	if n >= perUserActiveCap {
		return "", ErrJobLimitPerUser
	}

	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM ai_jobs WHERE status IN ('queued','running')`).Scan(&n); err != nil {
		return "", err
	}
	if n >= globalActiveCap {
		return "", ErrJobLimitGlobal
	}

	today := time.Now().UTC().Format("2006-01-02")
	var used int
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(count, 0) FROM ai_usage_daily
		WHERE user_id = $1 AND day = $2`, j.UserID, today).Scan(&used)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	if used >= dailyCap {
		return "", ErrJobLimitDaily
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO ai_usage_daily (user_id, day, count) VALUES ($1, $2, 1)
		ON CONFLICT (user_id, day) DO UPDATE SET count = ai_usage_daily.count + 1`,
		j.UserID, today); err != nil {
		return "", err
	}

	var id string
	if err := tx.QueryRow(ctx, `
		INSERT INTO ai_jobs (user_id, status, provider, model, image_urls)
		VALUES ($1, 'queued', $2, $3, $4)
		RETURNING id`,
		j.UserID, j.Provider, j.Model, imgs).Scan(&id); err != nil {
		return "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return id, nil
}

const aiJobCols = `id, user_id, status, provider, model, image_urls,
    recipe_json, error, attempts, created_at, started_at, finished_at`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanAIJobRow(r rowScanner) (*models.AIJob, error) {
	var j models.AIJob
	var images, recipeJSON []byte
	var errStr *string
	if err := r.Scan(
		&j.ID, &j.UserID, &j.Status, &j.Provider, &j.Model,
		&images, &recipeJSON, &errStr, &j.Attempts,
		&j.CreatedAt, &j.StartedAt, &j.FinishedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(images, &j.ImageURLs); err != nil {
		return nil, fmt.Errorf("unmarshal image_urls: %w", err)
	}
	if len(recipeJSON) > 0 {
		if err := json.Unmarshal(recipeJSON, &j.RecipeJSON); err != nil {
			return nil, fmt.Errorf("unmarshal recipe_json: %w", err)
		}
	}
	if errStr != nil {
		j.Error = *errStr
	}
	return &j, nil
}

func (s *PostgresStore) GetAIJob(ctx context.Context, id string) (*models.AIJob, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+aiJobCols+` FROM ai_jobs WHERE id = $1`, id)
	return scanAIJobRow(row)
}

func (s *PostgresStore) ListUserAIJobs(ctx context.Context, userID string, since time.Time) ([]models.AIJob, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+aiJobCols+`
		FROM ai_jobs
		WHERE user_id = $1 AND created_at >= $2
		ORDER BY created_at DESC`, userID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.AIJob, 0)
	for rows.Next() {
		j, err := scanAIJobRow(rows)
		if err != nil {
			return nil, err
		}
		if j != nil {
			out = append(out, *j)
		}
	}
	return out, rows.Err()
}

func (s *PostgresStore) ClaimNextAIJob(ctx context.Context) (*models.AIJob, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var id string
	err = tx.QueryRow(ctx, `
		SELECT id FROM ai_jobs
		WHERE status = 'queued'
		ORDER BY created_at
		FOR UPDATE SKIP LOCKED
		LIMIT 1`).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE ai_jobs
		SET status='running', attempts = attempts + 1, started_at = now()
		WHERE id = $1`, id); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetAIJob(ctx, id)
}

func (s *PostgresStore) SetAIJobReady(ctx context.Context, id string, recipeJSON map[string]any) error {
	rj, err := json.Marshal(recipeJSON)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `
		UPDATE ai_jobs SET status='ready', recipe_json=$2, finished_at=now()
		WHERE id = $1`, id, rj)
	return err
}

func (s *PostgresStore) SetAIJobFailed(ctx context.Context, id string, errMsg string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE ai_jobs SET status='failed', error=$2, finished_at=now()
		WHERE id = $1`, id, errMsg)
	return err
}

func (s *PostgresStore) RequeueAIJob(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE ai_jobs SET status='queued', started_at=NULL
		WHERE id = $1`, id)
	return err
}

func (s *PostgresStore) DeleteAIJob(ctx context.Context, id, ownerID string) error {
	res, err := s.pool.Exec(ctx, `
		DELETE FROM ai_jobs
		WHERE id = $1 AND user_id = $2 AND status IN ('queued','ready','failed','cancelled')`,
		id, ownerID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *PostgresStore) MarkAIJobConsumed(ctx context.Context, id, ownerID string) error {
	res, err := s.pool.Exec(ctx, `
		UPDATE ai_jobs SET status='consumed', finished_at=COALESCE(finished_at, now())
		WHERE id = $1 AND user_id = $2 AND status = 'ready'`, id, ownerID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *PostgresStore) ResetOrphanedAIJobs(ctx context.Context, maxAttempts int) error {
	if _, err := s.pool.Exec(ctx, `
		UPDATE ai_jobs SET status='queued', started_at=NULL
		WHERE status='running' AND attempts < $1`, maxAttempts); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, `
		UPDATE ai_jobs SET status='failed', error='abandoned after restart', finished_at=now()
		WHERE status='running' AND attempts >= $1`, maxAttempts)
	return err
}

func (s *PostgresStore) DeleteOldAIJobs(ctx context.Context, before time.Time) (int, error) {
	res, err := s.pool.Exec(ctx, `
		DELETE FROM ai_jobs
		WHERE (finished_at IS NOT NULL AND finished_at < $1)
		   OR (status='cancelled' AND created_at < $1)`, before)
	if err != nil {
		return 0, err
	}
	return int(res.RowsAffected()), nil
}

func (s *PostgresStore) CountActiveAIJobs(ctx context.Context, userID string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM ai_jobs
		WHERE user_id = $1 AND status IN ('queued','running')`, userID).Scan(&n)
	return n, err
}

func (s *PostgresStore) CountActiveAIJobsGlobal(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM ai_jobs WHERE status IN ('queued','running')`).Scan(&n)
	return n, err
}

func (s *PostgresStore) GetTodayAIUsage(ctx context.Context, userID string) (int, error) {
	today := time.Now().UTC().Format("2006-01-02")
	var n int
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(count, 0) FROM ai_usage_daily
		WHERE user_id = $1 AND day = $2`, userID, today).Scan(&n)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	return n, nil
}
