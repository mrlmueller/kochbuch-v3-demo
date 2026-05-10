-- +goose Up
-- +goose StatementBegin
ALTER TABLE ai_jobs
    ADD COLUMN input_tokens  INT     NOT NULL DEFAULT 0,
    ADD COLUMN output_tokens INT     NOT NULL DEFAULT 0,
    ADD COLUMN cost_usd      NUMERIC(10, 5) NOT NULL DEFAULT 0;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX IF NOT EXISTS idx_ai_jobs_finished_at ON ai_jobs(finished_at);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_ai_jobs_finished_at;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE ai_jobs
    DROP COLUMN IF EXISTS cost_usd,
    DROP COLUMN IF EXISTS output_tokens,
    DROP COLUMN IF EXISTS input_tokens;
-- +goose StatementEnd
