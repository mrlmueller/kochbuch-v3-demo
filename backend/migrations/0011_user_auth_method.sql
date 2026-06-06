-- +goose Up
-- +goose StatementBegin
ALTER TABLE users ADD COLUMN auth_method TEXT
  CHECK (auth_method IN ('google','password'));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE users DROP COLUMN auth_method;
-- +goose StatementEnd
