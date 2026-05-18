-- +goose Up
-- Per-user, per-day override of the daily AI-job cap. NULL = use the
-- server default; a value wins over it for that user on that day only.
ALTER TABLE ai_usage_daily ADD COLUMN limit_override INT;

-- +goose Down
ALTER TABLE ai_usage_daily DROP COLUMN IF EXISTS limit_override;
