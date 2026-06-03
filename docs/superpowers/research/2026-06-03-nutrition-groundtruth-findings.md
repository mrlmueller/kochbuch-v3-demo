# Ground-truth build — findings & pipeline lessons (M1)

Date: 2026-06-03. Built by hand (no subagents): selected 14 recipes from the live
DB, looked up every ingredient (USDA + German/BLS-aligned sources), converted
amounts→grams, applied cooking transforms, computed per-serving macros. Output:
`backend/cmd/nutrition-eval/recipes.json` (the reference set) +
`groundtruth_compute.py` (the auditable derivation — a hand-built prototype of the
deterministic compute step).

## The reference set (per serving)

| Recipe | srv | kcal | prot | fat | carb | sugar | fibre | unc% |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| Amerikaner | 20 | 123 | 2.6 | 5.1 | 16.4 | 5.7 | 0.5 | 10 |
| Apfelkuchen | 12 | 238 | 3.7 | 10.1 | 32.2 | 19.0 | 1.8 | 15 |
| Apfelküchle | 4 | 376 | 9.0 | 14.0 | 48.6 | 4.0 | 2.0 | 25 |
| Honig-Senf-Dressing | 4 | 107 | 0.1 | 10.1 | 4.2 | 4.0 | 0.0 | 12 |
| Kartoffelpüree | 4 | 402 | 8.8 | 20.1 | 48.6 | 6.8 | 5.2 | 10 |
| Sauce Hollandaise | 4 | 411 | 2.7 | 44.6 | 1.6 | 1.2 | 0.0 | 15 |
| Asiatische Spareribs | 4 | 546 | 33.7 | 35.9 | 18.3 | 12.5 | 0.8 | 30 |
| Auberginen Hackfleisch Pfanne | 4 | 498 | 26.5 | 36.9 | 19.4 | 10.7 | 6.8 | 15 |
| Käsespätzle | 4 | 766 | 34.3 | 37.5 | 71.8 | 7.0 | 4.1 | 15 |
| Schnitzel | 2 | 844 | 80.1 | 43.7 | 27.1 | 1.0 | 1.4 | 20 |
| Spaghetti Bolognese | 2 | 1146 | 56.2 | 54.9 | 107.8 | 15.8 | 6.6 | 18 |
| Tortilla-Omelett | 1 | 597 | 32.4 | 33.9 | 37.9 | 6.3 | 3.1 | 15 |
| Mais (Airfryer) | 2 | 148 | 3.2 | 8.4 | 19.0 | 6.3 | 2.7 | 15 |
| Lachscreme | 4 | 286 | 12.8 | 24.2 | 3.2 | 2.4 | 0.2 | 15 |

Internal Atwater check (4P+9F+4C vs kcal) deviates <5% on all but Mais (11%, corn's
measured vs Atwater kcal) — no gross arithmetic errors.

## Pipeline lessons (the payoff)

**1. Servings are frequently wrong — the estimator must not trust them blind.**
- Apfelkuchen: DB `servings=2` for a 28 cm Springform cake (→ used 12). *It's marked
  confirmed.* The Part-1 confirm flag does NOT guarantee sane servings.
- Spaghetti Bolognese: 400 g meat + a pack of pasta for "2" → 1146 kcal/serving; reads
  like 3. Schnitzel: 700 g pork for "2" → 80 g protein/serving.
- **Implication:** add a servings *plausibility check* (e.g., flag if kcal/serving is
  wildly out of band for the category) and surface it in the calibration UI. Nutrition
  display should gate on a *servings-sane* signal, not just `confirmed`.

**2. The biggest calorie source is often invisible in the data.** Schnitzel's frying
oil is `"zum Frittieren"` (no amount); Apfelküchle is deep-fried in *unlisted* oil.
Estimating absorbed oil from the *method* (steps text) is mandatory, not optional. The
steps — not the ingredient list — tell us braten/frittieren/kochen/backen.

**3. Key ingredients can be missing entirely.** Apfelküchle (apple fritters) lists no
apples — only the batter. The estimator needs a sanity check (does the title/method
imply an ingredient absent from the list?) or must accept the listed data and flag low
confidence.

**4. Amounts are messy** — the parser must handle: ranges (`600 bis 800 g`, `1–4 EL`,
`150–200 g` → midpoint), packs (`Eine Packung` → 500 g pasta, but ÷ servings sanity),
pieces (`2 Auberginen`, `1 Knolle`, `2 Maiskolben` → typical weights), section markers
(`Glasur:`, `Optional:`, `für das Kochwasser`), and qualifiers (`gestr. TL`, `Prise`,
`Msp`, `nach Bedarf`).

**5. "Where the ingredient goes" matters as much as the amount.** Spareribs: the 3 EL
salt + 4 EL soy + garlic + onion are in the *boiling water* (discarded) — counting them
would be wrong. The glaze is what's eaten. → the model must read the steps to decide
discarded vs eaten (the component-vs-dish-basis flag from the research).

**6. Composite/branded items need their own lookup** (`fertige Spätzle`, `Tomatensoße
mit Basilikum (Glas)`, `Hoisin-Soße`, `Frischkäse`) — these resolve to prepared-product
entries, not raw ingredients. BLS has many; OFF/label values fill gaps.

## Reusable per-100 g macro table (seed for the ingredient layer)

Order: kcal / protein / fat / carbs / sugar / fibre. Sources: USDA FoodData Central via
nutritionvalue.org & fatsecret; German/BLS-aligned via fddb, naehrwertrechner.de,
foodiary, yazio. (Full URLs in the run logs; values cross-checked across ≥2 sources.)

```
butter        717/0.85/81/0.1/0.1/0      sugar         400/0/0/100/100/0
flour405      348/10/1/72/0.7/3.2        milk3.5%      66/3.4/3.6/4.8/4.8/0
egg_whole     143/12.6/9.5/0.7/0.4/0     egg_yolk      322/15.9/26.5/3.6/0.6/0
oil(neutral)  884/0/100/0/0/0            olive_oil     884/0/100/0/0/0
apple         54/0.3/0.2/12/10/2.0       potato        77/2.1/0.1/17.5/0.8/2.1
cream30       293/2.5/30/3.4/3.4/0       creme_fraiche 300/2.5/31/3/3/0
cream_cheese  330/6.5/32/3.3/3/0         hard_cheese   385/27/30/0.5/0.5/0
cheese_grated 360/24/28/1/0.5/0          spaetzle      170/6.5/4/27/1.5/1.5
spaghetti_dry 371/13/1.5/75/3/3.2        breadcrumbs   380/11/5/72/3/4
tomato_sauce  50/1.5/2/7/6/1.3           tortilla      300/8/7/49/2.5/3
ground_meat   260/18.5/21/0/0/0          pork_loin     130/21/4.5/0/0/0
pork_ribs     277/15.5/23.4/0/0/0        smoked_salmon 200/21/12/0/0/0
onion         40/1.1/0.1/9.3/4.2/1.7     tomato        18/0.9/0.2/3.9/2.6/1.2
aubergine     25/1/0.2/6/3.5/3           garlic        149/6.4/0.5/33/1/2.1
corn          86/3.2/1.4/19/6.3/2.7      honey         304/0.3/0/82/82/0.2
hoisin        220/3.3/3.4/44/27/2.8      sesame        573/17/50/23/0.3/12
```

## Unit / portion conventions used (seed for the unit table)

```
1 EL = 15 ml   → oil 13-14 g, liquid 15 g, honey 21 g, jam 20 g, hoisin 20 g, cream 15 g
1 TL = 5 ml    → oil 5 g, sugar 4 g, honey 7 g, mustard 5 g
1 Ei (M/L)     = 53 g edible   |  1 Eigelb (L) = 18 g
1 Zwiebel      = 110 g  |  1 Tomate = 100-120 g  |  1 Aubergine = 275 g
1 Knoblauchzehe= 4 g    |  1 Knolle = 40 g  |  1 Maiskolben = ~100 g kernels
1 große Tortilla = 64 g |  Prise/Msp = negligible (drop)
```

## Cooking-transform factors applied (seed for cooking_factors)

```
Deep-fry batter/dough (frittieren)  oil uptake +7 g / 100 g   (Apfelküchle)
Deep/pan-fry breaded (panieren)     oil uptake +6 g / 100 g   (Schnitzel)
Pan-fry, oil + meat fat stay (dish) keep added oil + meat fat (Bolognese, Auberginen-Pfanne)
Boil staple (pasta/potato)          macros unchanged; compute from dry/raw amount
Boil meat then bake (renders out)   spareribs fat ret 0.65, protein 0.92, kcal 0.72
Bake (cake/cookies)                 macros = Σ ingredients (water loss ≠ macro loss)
Unquantified salt/spices/herbs      drop;  unquantified cooking fat → estimate
```

## Recommended M1 spec refinements (from doing this by hand)

- **Add a `servings_plausible` heuristic** to the eval output (kcal/serving vs a
  category band) — it caught 2-3 mis-set recipes here and is cheap.
- The estimator prompt MUST receive the **steps text**, not just ingredients — method
  (frittieren/kochen/braten) and "what's discarded" live only there.
- Treat each `uncertainty_pct` as the noise floor; Spareribs (30%) and Apfelküchle (25%)
  are deliberately loose (bone fraction, missing apples) — don't over-optimize to them.
- The reusable macro + unit + transform tables above are the literal seed content for
  M2's `bls_foods`/`ingredient_aliases`/unit table and M3's `cooking_factors`.
