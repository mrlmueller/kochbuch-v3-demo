# Recipe calibration tracking + admin inline edit — design

Date: 2026-06-02
Branch: `feat/recipe-calibration` (stacked on `feat/rezepte-cleanup-and-last-active`
so the new migration stays contiguous at `0009`)

## Context

The cookbook stores recipes with a free-text `servings` field and JSONB
ingredients. Before we can add nutritional values (a separate, later project),
every recipe needs its servings + ingredients reviewed and confirmed by hand.
This work adds the tracking + editing affordances to make that review practical,
admin-only, with **zero change to the non-admin experience**.

This is **Part 1**. Part 2 (nutrition) is scoped at the bottom but not built here.

## Goals

1. Track per recipe whether it has been hand-confirmed (binary).
2. Let the admin edit any recipe directly from the recipe page.
3. Surface confirmation status to the admin on: the recipe detail page, the
   browse/category cards, and the admin recipe list (with filter + progress).
4. Keep the public payload, the static cache, and the non-admin UX byte-identical.

## Non-goals (this part)

- Structured ingredient quantities (amount/unit). **Deferred to Part 2.** The
  edit form's existing behaviour of writing `amount: 0, unit: ''` on save is
  left as-is; Part 2 will re-derive structure when it builds nutrition.
- Any nutrition computation, storage, or display.
- A `servings` schema change. Calibration means editing the existing text field
  to a clean integer; the existing parser reads it.
- A notes field on the confirmation. Binary only.

## Architecture

### Data model

Migration `0009_recipe_confirmed.sql`:

```sql
ALTER TABLE recipes ADD COLUMN confirmed_at TIMESTAMPTZ;
```

`NULL` = not yet calibrated; set = confirmed (timestamp is a free audit of when).

### Status delivery (the key decision)

Recipe + browse pages are statically prerendered and served from one shared
cache to everyone. To keep that payload identical, `confirmed_at` is **not**
added to any public recipe response. Instead, two admin-only endpoints:

- `GET  /api/admin/recipes/status`         → `{ "confirmed": ["slug", ...] }`
- `PATCH /api/admin/recipes/{slug}/confirm` → body `{ "confirmed": bool }`

Both live under the existing `RequireAdmin` group and the already-allowlisted
`/api/admin/recipes` proxy prefix. The frontend fetches the status set
**client-side, only when `me.role === 'admin'`** (sessionStorage-cached, exactly
like `useMe()`), and overlays badges. Non-admins never call it, and the backend
gates it regardless.

*Rejected alternative:* embed `confirmed_at` in the public payload — changes the
shared cache and leaks status into every visitor's JSON.

### Backend

- `db.Store`: `ListConfirmedSlugs(ctx) ([]string, error)`,
  `SetRecipeConfirmed(ctx, slug string, confirmed bool) error`.
- `SetRecipeConfirmed` sets `confirmed_at = now()` (true) or `NULL` (false);
  returns `db.ErrRecipeNotFound` when the slug doesn't exist (→ 404).
- Handlers `ListRecipeConfirmations` and `SetRecipeConfirmed` in a new
  `admin_recipe_status.go`, wired into the admin route group.

### Frontend

- `lib/use-admin-confirmations.ts`: admin-only hook, sessionStorage-cached set,
  `{ confirmed, isConfirmed(slug), setConfirmed(slug, bool), ready }`. No-op for
  non-admins.
- `lib/api.ts`: `clientGetRecipeConfirmations()`, `clientSetRecipeConfirmed()`.
- Recipe detail (`detail-client.tsx`): admin-only badge + one-click toggle.
  `OwnerControls` editing gate becomes: **Bearbeiten** when `isAdmin || isOwner`;
  **Löschen** stays `isOwner` only.
- Edit page (`edit-client.tsx`): pass real `isAdmin` from `useMe()`.
- Browse cards: admin-only marker for un-calibrated recipes.
- Admin list (`recipe-list.tsx`): confirmed/unconfirmed filter, per-row status +
  toggle, "X of Y confirmed" progress count.

## Testing

- Go: TDD the two handlers via `MockStore` (happy path, not-found → 404,
  bad body → 400) following `recipes_test.go`.
- `go build ./... && go test ./...` green.
- Frontend: typecheck + lint + build green.

## Part 2 — nutrition (scoped, not built here)

Tool-augmented Claude pipeline: per *confirmed* recipe, map each ingredient (with
amount) to an authoritative food database, sum raw macros, then apply cooking
yield + nutrient-retention + fat-absorption factors (USDA publishes these) for
frying oil pickup, water loss, etc. Extend the existing `cmd/ai-eval` harness into
a nutrition eval: reference recipes with trusted macros, scored by mean error on
kcal/protein/fat/carbs. Part 1's only obligations to Part 2 — a clean integer
servings and a "confirmed" gate — are satisfied above.
