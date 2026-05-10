-- +goose Up
-- +goose StatementBegin
ALTER TABLE recipes ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX IF NOT EXISTS idx_recipes_created_by ON recipes(created_by);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_recipes_created_by;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE recipes DROP COLUMN IF EXISTS created_by;
-- +goose StatementEnd
