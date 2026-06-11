-- +goose Up
-- Backfill any rows whose ingredients/steps are not a JSON array (e.g. a JSON
-- null written by an older CreateRecipe when the field was omitted). A scalar
-- here breaks the recipe-list query's jsonb_array_elements(...).
-- +goose StatementBegin
UPDATE recipes SET ingredients = '[]'::jsonb
  WHERE ingredients IS NULL OR jsonb_typeof(ingredients) <> 'array';
-- +goose StatementEnd

-- +goose StatementBegin
UPDATE recipes SET steps = '[]'::jsonb
  WHERE steps IS NULL OR jsonb_typeof(steps) <> 'array';
-- +goose StatementEnd

-- Backstop: guarantee these columns can only ever hold a JSON array. The write
-- path coerces nil -> [] so this never trips in normal operation.
-- +goose StatementBegin
ALTER TABLE recipes ADD CONSTRAINT recipes_ingredients_is_array
  CHECK (jsonb_typeof(ingredients) = 'array');
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE recipes ADD CONSTRAINT recipes_steps_is_array
  CHECK (jsonb_typeof(steps) = 'array');
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_ingredients_is_array;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_steps_is_array;
-- +goose StatementEnd
