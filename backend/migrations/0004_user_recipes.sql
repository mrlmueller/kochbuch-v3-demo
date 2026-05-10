-- +goose Up
-- +goose StatementBegin
ALTER TABLE recipes ADD COLUMN owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX IF NOT EXISTS idx_recipes_owner ON recipes(owner_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS ai_jobs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        TEXT        NOT NULL CHECK (status IN ('queued','running','ready','failed','cancelled','consumed')),
    provider      TEXT        NOT NULL,
    model         TEXT        NOT NULL,
    image_urls    JSONB       NOT NULL,
    recipe_json   JSONB,
    error         TEXT,
    attempts      INT         NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX IF NOT EXISTS idx_ai_jobs_user_status ON ai_jobs(user_id, status);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status_created ON ai_jobs(status, created_at);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS ai_usage_daily (
    user_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day      DATE        NOT NULL,
    count    INT         NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS ai_usage_daily;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS ai_jobs;
-- +goose StatementEnd

-- +goose StatementBegin
DROP INDEX IF EXISTS idx_recipes_owner;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE recipes DROP COLUMN IF EXISTS owner_id;
-- +goose StatementEnd
