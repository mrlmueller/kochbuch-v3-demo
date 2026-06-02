-- +goose Up
ALTER TABLE users ADD COLUMN last_active_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS last_active_at;
