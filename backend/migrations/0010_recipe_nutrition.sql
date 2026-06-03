-- +goose Up
-- +goose StatementBegin
ALTER TABLE ai_jobs
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'extraction'
    CHECK (kind IN ('extraction','nutrition')),
  ADD COLUMN recipe_slug TEXT REFERENCES recipes(slug) ON DELETE SET NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS recipe_nutrition (
    recipe_slug   TEXT PRIMARY KEY REFERENCES recipes(slug) ON DELETE CASCADE,
    per_recipe    JSONB            NOT NULL,
    per_serving   JSONB            NOT NULL,
    servings_used REAL             NOT NULL DEFAULT 0,
    line_items    JSONB            NOT NULL DEFAULT '[]',
    model         TEXT             NOT NULL,
    input_tokens  INT              NOT NULL DEFAULT 0,
    output_tokens INT              NOT NULL DEFAULT 0,
    cost_usd      DOUBLE PRECISION NOT NULL DEFAULT 0,
    outdated      BOOLEAN          NOT NULL DEFAULT FALSE,
    computed_at   TIMESTAMPTZ      NOT NULL DEFAULT now()
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS recipe_nutrition;
ALTER TABLE ai_jobs DROP COLUMN IF EXISTS recipe_slug;
ALTER TABLE ai_jobs DROP COLUMN IF EXISTS kind;
-- +goose StatementEnd
