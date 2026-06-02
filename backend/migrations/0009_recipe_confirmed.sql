-- +goose Up
ALTER TABLE recipes ADD COLUMN confirmed_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE recipes DROP COLUMN IF EXISTS confirmed_at;
