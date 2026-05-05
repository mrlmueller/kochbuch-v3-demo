-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS categories (
    slug        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    accent      TEXT NOT NULL DEFAULT '#C2410C'
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS recipes (
    slug           TEXT PRIMARY KEY,
    title          TEXT NOT NULL,
    category_slug  TEXT NOT NULL REFERENCES categories(slug),
    time_minutes   INTEGER NOT NULL DEFAULT 0,
    servings       TEXT NOT NULL DEFAULT '',
    ingredients    JSONB NOT NULL DEFAULT '[]',
    steps          JSONB NOT NULL DEFAULT '[]',
    notes          TEXT NOT NULL DEFAULT '',
    image_url      TEXT NOT NULL DEFAULT '',
    image_blurhash TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category_slug);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes(title);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS recipes;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS categories;
-- +goose StatementEnd
