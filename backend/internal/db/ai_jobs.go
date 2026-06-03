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
	var override *int
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(count, 0), limit_override FROM ai_usage_daily
		WHERE user_id = $1 AND day = $2`, j.UserID, today).Scan(&used, &override)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	// An admin-set override for today wins over the server default.
	if override != nil {
		dailyCap = *override
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
    recipe_json, error, attempts, input_tokens, output_tokens, cost_usd,
    created_at, started_at, finished_at, kind, recipe_slug`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanAIJobRow(r rowScanner) (*models.AIJob, error) {
	var j models.AIJob
	var images, recipeJSON []byte
	var errStr *string
	var recipeSlug *string
	if err := r.Scan(
		&j.ID, &j.UserID, &j.Status, &j.Provider, &j.Model,
		&images, &recipeJSON, &errStr, &j.Attempts,
		&j.InputTokens, &j.OutputTokens, &j.CostUSD,
		&j.CreatedAt, &j.StartedAt, &j.FinishedAt, &j.Kind, &recipeSlug,
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
	j.RecipeSlug = recipeSlug
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

func (s *PostgresStore) SetAIJobReady(ctx context.Context, id string, recipeJSON map[string]any, inTokens, outTokens int, costUSD float64) error {
	rj, err := json.Marshal(recipeJSON)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `
		UPDATE ai_jobs SET
			status='ready',
			recipe_json=$2,
			input_tokens=$3,
			output_tokens=$4,
			cost_usd=$5,
			finished_at=now()
		WHERE id = $1`, id, rj, inTokens, outTokens, costUSD)
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

// DeleteAIJob soft-deletes a job by marking it 'cancelled'. The row stays
// in the table so its input_tokens / output_tokens / cost_usd remain
// counted in admin stats — the cost was already paid to the provider, we
// never want to lose that signal when a user throws away an unreviewed
// recipe. Hard cleanup of cost-free terminal rows happens via the cleanup
// ticker after 30 days (see DeleteOldAIJobs).
func (s *PostgresStore) DeleteAIJob(ctx context.Context, id, ownerID string) error {
	res, err := s.pool.Exec(ctx, `
		UPDATE ai_jobs
		SET status = 'cancelled',
		    finished_at = COALESCE(finished_at, now())
		WHERE id = $1 AND user_id = $2
		  AND status IN ('queued','ready','failed','cancelled')`,
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

// DeleteOldAIJobs purges old terminal rows, but only those with no cost
// attached — rows that incurred a charge stay forever so the Kosten page's
// lifetime totals never silently shrink.
func (s *PostgresStore) DeleteOldAIJobs(ctx context.Context, before time.Time) (int, error) {
	res, err := s.pool.Exec(ctx, `
		DELETE FROM ai_jobs
		WHERE cost_usd = 0
		  AND (
		       (finished_at IS NOT NULL AND finished_at < $1)
		    OR (status = 'cancelled' AND created_at < $1)
		  )`, before)
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

// GetTodayAILimitOverride returns the admin-set daily-cap override for the
// user (today, UTC), or nil when none is set — in which case the server
// default applies.
func (s *PostgresStore) GetTodayAILimitOverride(ctx context.Context, userID string) (*int, error) {
	today := time.Now().UTC().Format("2006-01-02")
	var override *int
	err := s.pool.QueryRow(ctx, `
		SELECT limit_override FROM ai_usage_daily
		WHERE user_id = $1 AND day = $2`, userID, today).Scan(&override)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return override, nil
}

// SetTodayAILimitOverride upserts the daily-cap override for the user
// (today, UTC). It only resets at the next UTC day rollover.
func (s *PostgresStore) SetTodayAILimitOverride(ctx context.Context, userID string, limit int) error {
	today := time.Now().UTC().Format("2006-01-02")
	_, err := s.pool.Exec(ctx, `
		INSERT INTO ai_usage_daily (user_id, day, count, limit_override)
		VALUES ($1, $2, 0, $3)
		ON CONFLICT (user_id, day) DO UPDATE SET limit_override = $3`,
		userID, today, limit)
	return err
}

// GetAIStats aggregates AI-job usage for the admin Kosten page. One DB
// round-trip per bucket but each is cheap (count + sum over a single
// indexed table).
func (s *PostgresStore) GetAIStats(ctx context.Context) (*models.AIStats, error) {
	out := &models.AIStats{GeneratedAt: time.Now().UTC()}

	now := time.Now().UTC()
	cut7 := now.AddDate(0, 0, -7)
	cut30 := now.AddDate(0, 0, -30)

	if err := s.scanBucket(ctx, &out.Totals, ""); err != nil {
		return nil, fmt.Errorf("totals: %w", err)
	}
	if err := s.scanBucket(ctx, &out.Last7d, "AND created_at >= $1", cut7); err != nil {
		return nil, fmt.Errorf("last7d: %w", err)
	}
	if err := s.scanBucket(ctx, &out.Last30d, "AND created_at >= $1", cut30); err != nil {
		return nil, fmt.Errorf("last30d: %w", err)
	}

	// Per-task-kind breakdown (extraction vs nutrition; only successful jobs).
	kindRows, err := s.pool.Query(ctx, `
		SELECT kind,
		       COUNT(*),
		       COALESCE(SUM(input_tokens), 0),
		       COALESCE(SUM(output_tokens), 0),
		       COALESCE(SUM(cost_usd), 0)
		FROM ai_jobs
		WHERE status IN ('ready', 'consumed')
		GROUP BY kind
		ORDER BY SUM(cost_usd) DESC`)
	if err != nil {
		return nil, fmt.Errorf("by_kind: %w", err)
	}
	for kindRows.Next() {
		var k models.AIStatsByKind
		if err := kindRows.Scan(&k.Kind, &k.Jobs, &k.InputTokens, &k.OutputTokens, &k.CostUSD); err != nil {
			kindRows.Close()
			return nil, fmt.Errorf("scan by_kind: %w", err)
		}
		out.ByKind = append(out.ByKind, k)
	}
	kindRows.Close()

	// Per-model breakdown (only successful jobs — failures had no cost).
	rows, err := s.pool.Query(ctx, `
		SELECT provider, model,
		       COUNT(*),
		       COALESCE(SUM(input_tokens), 0),
		       COALESCE(SUM(output_tokens), 0),
		       COALESCE(SUM(cost_usd), 0)
		FROM ai_jobs
		WHERE status IN ('ready', 'consumed')
		GROUP BY provider, model
		ORDER BY SUM(cost_usd) DESC`)
	if err != nil {
		return nil, fmt.Errorf("by_model: %w", err)
	}
	for rows.Next() {
		var m models.AIStatsByModel
		if err := rows.Scan(&m.Provider, &m.Model, &m.Jobs, &m.InputTokens, &m.OutputTokens, &m.CostUSD); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan by_model: %w", err)
		}
		out.ByModel = append(out.ByModel, m)
	}
	rows.Close()

	// Per-user breakdown joined with email.
	rows, err = s.pool.Query(ctx, `
		SELECT j.user_id, COALESCE(u.email, ''),
		       COUNT(*),
		       COALESCE(SUM(j.cost_usd), 0),
		       MAX(j.created_at)
		FROM ai_jobs j
		LEFT JOIN users u ON u.id = j.user_id
		WHERE j.status IN ('ready', 'consumed')
		GROUP BY j.user_id, u.email
		ORDER BY SUM(j.cost_usd) DESC`)
	if err != nil {
		return nil, fmt.Errorf("by_user: %w", err)
	}
	for rows.Next() {
		var u models.AIStatsByUser
		var last time.Time
		if err := rows.Scan(&u.UserID, &u.Email, &u.Jobs, &u.CostUSD, &last); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan by_user: %w", err)
		}
		if !last.IsZero() {
			u.LastUsedAt = &last
		}
		out.ByUser = append(out.ByUser, u)
	}
	rows.Close()

	// Recent 25 jobs across all users (any status).
	rows, err = s.pool.Query(ctx, `
		SELECT j.id, COALESCE(u.email, ''), j.kind, j.provider, j.model, j.status,
		       j.input_tokens, j.output_tokens, j.cost_usd, j.created_at
		FROM ai_jobs j
		LEFT JOIN users u ON u.id = j.user_id
		ORDER BY j.created_at DESC
		LIMIT 25`)
	if err != nil {
		return nil, fmt.Errorf("recent: %w", err)
	}
	for rows.Next() {
		var it models.AIStatsRecentItem
		if err := rows.Scan(&it.JobID, &it.UserEmail, &it.Kind, &it.Provider, &it.Model, &it.Status,
			&it.InputTokens, &it.OutputTokens, &it.CostUSD, &it.CreatedAt); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan recent: %w", err)
		}
		out.Recent = append(out.Recent, it)
	}
	rows.Close()

	return out, nil
}

// scanBucket counts and sums ai_jobs filtered by `extraWhere` (which must
// start with "AND " — see GetAIStats callers). status='failed' rows have
// zero cost, so summing cost_usd is correct.
func (s *PostgresStore) scanBucket(ctx context.Context, b *models.AIStatsBucket, extraWhere string, args ...any) error {
	q := `
		SELECT COUNT(*),
		       COUNT(*) FILTER (WHERE status IN ('ready', 'consumed')),
		       COUNT(*) FILTER (WHERE status = 'failed'),
		       COALESCE(SUM(input_tokens), 0),
		       COALESCE(SUM(output_tokens), 0),
		       COALESCE(SUM(cost_usd), 0)
		FROM ai_jobs
		WHERE 1=1 ` + extraWhere
	return s.pool.QueryRow(ctx, q, args...).Scan(
		&b.Jobs, &b.SuccessJobs, &b.FailedJobs, &b.InputTokens, &b.OutputTokens, &b.CostUSD,
	)
}
