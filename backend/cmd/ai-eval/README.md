# AI eval

Compares Claude (Sonnet 4.6, Haiku 4.5) and OpenAI (GPT-5.4 mini, nano) on a
small set of reference dishes. Outputs a markdown table.

## Setup

Edit `dishes.json` — add 5–10 dishes, each with `image_urls` (Cloudinary
recommended) and a `reference` (title, ingredient names, expected step count
range).

## Run

```
ANTHROPIC_API_KEY=… OPENAI_API_KEY=… go run ./backend/cmd/ai-eval
```

Models with a missing API key are skipped (Claude vs OpenAI providers are
independent). The script writes `results.md` next to itself.

## Metrics

- `title_match` — case-insensitive equality with the reference title
- `ingr_jaccard` — Jaccard overlap between extracted and reference ingredient
  name sets (lowercased, trimmed)
- `steps_ok` — extracted step count is within `[step_count_min, step_count_max]`
- `latency_ms` — wall-clock for the single `Extract` call
- `cost_usd` — computed from the in-repo price table (`internal/ai/cost.go`)
