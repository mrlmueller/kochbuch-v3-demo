#!/usr/bin/env python3
"""
Ground-truth computation for the nutrition eval reference set (M1).

This is a HAND-BUILT prototype of the deterministic compute step. Every value
here is a documented human judgment call: per-100g macros looked up from
USDA/German sources (cited in docs/.../2026-06-03-nutrition-research.md and the
findings doc), amount->grams conversions, and cooking-transform decisions
(EuroFIR/Bognar: oil absorption, fat rendering, retention).

Macro tuple order: (kcal, protein_g, fat_g, carbs_g, sugar_g, fibre_g) per 100 g.
Run:  python backend/cmd/nutrition-eval/groundtruth_compute.py
It writes recipes.json next to itself and prints a summary table.
"""
import json, os

# ---- Master per-100g macro table (looked up; raw unless noted) --------------
M = {
    # baking / dairy / staples
    "butter":        (717, 0.85, 81.0, 0.1, 0.1, 0.0),
    "sugar":         (400, 0.0,  0.0,  100, 100, 0.0),
    "vanillesugar":  (390, 0.0,  0.0,  98,  95,  0.0),
    "egg_whole":     (143, 12.6, 9.5,  0.7, 0.4, 0.0),   # ~53 g edible/egg (M/L)
    "egg_yolk":      (322, 15.9, 26.5, 3.6, 0.6, 0.0),   # ~18 g/yolk (L)
    "flour405":      (348, 10.0, 1.0,  72.0, 0.7, 3.2),
    "milk":          (66,  3.4,  3.6,  4.8, 4.8, 0.0),   # Vollmilch 3.5%
    "apple":         (54,  0.3,  0.2,  12.0, 10.0, 2.0),
    "apricot_jam":   (250, 0.4,  0.1,  62.0, 60.0, 0.8),
    "oil":           (884, 0.0,  100.0, 0.0, 0.0, 0.0),  # neutral veg/rapeseed
    "olive_oil":     (884, 0.0,  100.0, 0.0, 0.0, 0.0),
    "rum":           (231, 0.0,  0.0,  0.5, 0.5, 0.0),   # 40% abv; retention applied
    "honey":         (304, 0.3,  0.0,  82.0, 82.0, 0.2),
    "mustard_dijon": (110, 6.0,  7.0,  6.0, 1.5, 3.0),
    "balsamic":      (88,  0.5,  0.0,  17.0, 15.0, 0.0),
    "potato":        (77,  2.1,  0.1,  17.5, 0.8, 2.1),
    "creme_fraiche": (300, 2.5,  31.0, 3.0, 3.0, 0.0),
    "cream30":       (293, 2.5,  30.0, 3.4, 3.4, 0.0),   # Schlagsahne 30%
    "cream_cheese":  (330, 6.5,  32.0, 3.3, 3.0, 0.0),   # Frischkaese Doppelrahm
    "hard_cheese":   (385, 27.0, 30.0, 0.5, 0.5, 0.0),   # Emmentaler/Bergkaese
    "cheese_grated": (360, 24.0, 28.0, 1.0, 0.5, 0.0),   # Cheddar/Mozzarella mix
    "roestzwiebeln": (600, 9.0,  42.0, 45.0, 30.0, 5.0), # fried onions (topping)
    "spaetzle":      (170, 6.5,  4.0,  27.0, 1.5, 1.5),  # fresh/chilled, ready
    "spaghetti_dry": (371, 13.0, 1.5,  75.0, 3.0, 3.2),
    "breadcrumbs":   (380, 11.0, 5.0,  72.0, 3.0, 4.0),
    "tortilla":      (300, 8.0,  7.0,  49.0, 2.5, 3.0),  # ~64 g/large
    "tomato_sauce":  (50,  1.5,  2.0,  7.0, 6.0, 1.3),   # jarred w/ basil
    # meat / fish
    "ground_meat":   (260, 18.5, 21.0, 0.0, 0.0, 0.0),  # Hackfleisch gemischt raw
    "pork_loin":     (130, 21.0, 4.5,  0.0, 0.0, 0.0),  # Schweinelende, lean-ish
    "pork_ribs":     (277, 15.5, 23.4, 0.0, 0.0, 0.0),  # spareribs meat, lean+fat
    "smoked_salmon": (200, 21.0, 12.0, 0.0, 0.0, 0.0),  # Raeucher/Stremellachs
    # veg / produce
    "onion":         (40,  1.1,  0.1,  9.3, 4.2, 1.7),
    "tomato":        (18,  0.9,  0.2,  3.9, 2.6, 1.2),
    "aubergine":     (25,  1.0,  0.2,  6.0, 3.5, 3.0),
    "garlic":        (149, 6.4,  0.5,  33.0, 1.0, 2.1),
    "corn":          (86,  3.2,  1.4,  19.0, 6.3, 2.7),  # kernels, ~100 g/cob
    # asian condiments (spareribs glaze)
    "soy_dark":      (60,  8.0,  0.0,  6.0, 1.0, 0.0),
    "soy_sweet":     (250, 3.0,  0.0,  58.0, 55.0, 0.0),
    "mirin":         (230, 0.2,  0.0,  43.0, 26.0, 0.0),
    "oyster_sauce":  (120, 2.0,  0.3,  27.0, 20.0, 0.0),
    "hoisin":        (220, 3.3,  3.4,  44.0, 27.0, 2.8),
    "sriracha":      (100, 2.0,  1.0,  19.0, 15.0, 1.0),
    "sesame":        (573, 17.0, 50.0, 23.0, 0.3, 12.0),
    "brown_sugar":   (380, 0.0,  0.0,  98.0, 97.0, 0.0),
}
KEYS = ("kcal", "protein_g", "fat_g", "carbs_g", "sugar_g", "fibre_g")

def macros(key, grams, ret=None):
    """grams of an ingredient -> macro dict, with optional per-macro retention."""
    base = M[key]
    out = {}
    for i, k in enumerate(KEYS):
        f = 1.0 if not ret else ret.get(k, 1.0)
        out[k] = base[i] * grams / 100.0 * f
    return out

def add(a, b):
    return {k: a[k] + b[k] for k in KEYS}

def oil_uptake(g):
    """Absorbed cooking oil (grams) -> kcal+fat only (pure fat)."""
    return {"kcal": 9.0 * g, "protein_g": 0, "fat_g": g, "carbs_g": 0, "sugar_g": 0, "fibre_g": 0}

# ---- The 14 recipes: components are (key, grams, optional_retention) ---------
# original_ingredients = the real recipe lines (fed to the estimator at eval time)
RECIPES = []
def R(**kw): RECIPES.append(kw)

R(id="amerikaner", title="Amerikaner", category="backen-und-suesses",
  db_servings=20, servings=20, uncertainty=10,
  notes="Plain baked dough, no glaze in the data. ~20 small cakes.",
  ingredients=[("100 g","Butter"),("100 g","Zucker"),("1 Stk.","Vanillezucker"),
               ("1 Prise","Salz"),("3 Stk.","Eier"),("300 g","Mehl"),
               ("1 Stk.","Backpulver"),("4 EL","Milch")],
  comp=[("butter",100),("sugar",100),("vanillesugar",8),("egg_whole",159),
        ("flour405",300),("milk",60)])

R(id="apfelkuchen", title="Apfelkuchen", category="backen-und-suesses",
  db_servings=2, servings=12, uncertainty=15,
  notes="DB servings=2 is WRONG for a 28cm Springform cake -> used 12. Apricot glaze counted.",
  ingredients=[("125 g","Butter oder Margarine"),("125 g","Zucker"),("3 Stk.","Eier"),
               ("Prise","Salz"),("4 Tropfen","Zitronen-Backöl"),("200 g","Weizenmehl"),
               ("6 g","Backpulver"),("1–4 EL","Milch"),("750 g","Äpfel"),
               ("2 EL","Aprikosenmarmelade")],
  comp=[("butter",125),("sugar",125),("egg_whole",159),("flour405",200),
        ("milk",38),("apple",750),("apricot_jam",40)])

R(id="apfelkuechle", title="Apfelküchle", category="backen-und-suesses",
  db_servings=4, servings=4, uncertainty=25,
  notes="DATA GAP: apples are NOT in the ingredient list (it's only the batter). "
        "Computed batter + deep-fry oil uptake (+7 g/100 g batter). Real dish would add apples.",
  ingredients=[("1 Stk","Ei"),("2 TL","Zucker"),("125 ml","Milch"),("3 EL","Rum"),
               ("2 TL","Öl"),("250 g","Mehl"),("1 gestr. TL","Backpulver")],
  comp=[("egg_whole",53),("sugar",8),("milk",125),("rum",42,{"kcal":0.5,"carbs_g":0.5,"sugar_g":0.5}),
        ("oil",10),("flour405",250)],
  oil_g=34)  # batter ~488 g x 7%

R(id="honig-senf-dressing", title="Honig-Senf-Dressing", category="grundrezepte-und-saucen",
  db_servings=4, servings=4, uncertainty=12,
  notes="Raw emulsion, no transform. Per-serving = dressing portion.",
  ingredients=[("3 EL","Olivenöl"),("2 EL","Balsamico, mild"),("2 TL","Honig"),
               ("1 TL","Senf"),("1 Msp","Schwarzer Pfeffer"),("1 Msp","Salz")],
  comp=[("olive_oil",40),("balsamic",30),("honey",14),("mustard_dijon",5)])

R(id="kartoffelpueree", title="Kartoffelpüree", category="grundrezepte-und-saucen",
  db_servings=4, servings=4, uncertainty=10,
  notes="Boiled peeled potato (yield ~1.0; macros unchanged) + milk + butter.",
  ingredients=[("1 kg","Kartoffeln, mehlig kochend"),("400 ml","Milch"),("1 TL","Salz"),
               ("80 g","Butter"),("1 Msp","Muskatnuss")],
  comp=[("potato",1000),("milk",400),("butter",80)])

R(id="sauce-hollandaise", title="Sauce Hollandaise", category="grundrezepte-und-saucen",
  db_servings=4, servings=4, uncertainty=15,
  notes="Butter + egg yolk emulsion. Per-serving = ~66 g sauce.",
  ingredients=[("200 g","Butter"),("3 Stk.","Eigelb"),("1 EL","Limettensaft"),
               ("1 TL","Dijonsenf"),("1 TL","Crème fraîche"),("1 TL","Zucker"),
               ("0,5 TL","Weißweinessig"),("nach Bedarf","Salz"),("nach Bedarf","Pfeffer")],
  comp=[("butter",200),("egg_yolk",54),("mustard_dijon",5),("creme_fraiche",5),("sugar",4)])

R(id="asiatische-spareribs", title="Asiatische Spareribs aus dem Ofen", category="hauptgerichte",
  db_servings=4, servings=4, uncertainty=30,
  notes="HARDEST: 1.5 kg bone-in -> ~60% edible meat (900 g). Boiled 75 min "
        "(renders fat into discarded sud: fat ret 0.65, protein 0.92, kcal 0.72), then "
        "glazed+baked. Boil aromatics (salt/soy/garlic/onion) discarded. Glaze ~80% adheres.",
  ingredients=[("1,5 kg","Spareribs"),("3 EL","Salz (Kochwasser)"),("1 Knolle","Knoblauch (Kochwasser)"),
               ("1 Stk.","Zwiebel (Kochwasser)"),("4 EL","dunkle Sojasoße (Kochwasser)"),
               ("2 EL","Mirin"),("1 EL","Reisessig"),("2 EL","Austernsoße"),("1 EL","dunkle Sojasoße"),
               ("1,5 EL","süße Sojasoße"),("5 EL","Hoisin-Soße"),("1 TL","brauner Zucker"),
               ("1 EL","Sriracha"),("1 EL","Sesam"),("2 Stk.","Frühlingslauch")],
  comp=[("pork_ribs",900,{"fat_g":0.65,"protein_g":0.92,"kcal":0.72}),
        # glaze, 80% adheres:
        ("mirin",30*0.8),("oyster_sauce",36*0.8),("soy_dark",16*0.8),("soy_sweet",24*0.8),
        ("hoisin",100*0.8),("brown_sugar",5*0.8),("sriracha",16*0.8),("sesame",9*0.8)])

R(id="auberginen-hackfleisch-pfanne", title="Auberginen Hackfleisch Pfanne", category="hauptgerichte",
  db_servings=4, servings=4, uncertainty=15,
  notes="Pan-fried; added oil + rendered meat fat both stay in the Pfanne (dish basis). "
        "Broth (~0 kcal) and serving yogurt dropped.",
  ingredients=[("2","Auberginen, gewürfelt"),("2","Zwiebeln, gewürfelt"),("2","Knoblauchzehen"),
               ("5","Tomaten, gewürfelt"),("3 EL","Olivenöl"),("500 g","Hackfleisch"),
               ("1 EL","Oregano"),("1 EL","Paprikapulver"),("nach Geschmack","Salz und Pfeffer"),
               ("500 ml","Gemüsebrühe"),("nach Belieben","Naturjoghurt")],
  comp=[("aubergine",550),("onion",220),("garlic",8),("tomato",550),
        ("olive_oil",40),("ground_meat",500)])

R(id="kaesespaetzle", title="Käsespätzle", category="hauptgerichte",
  db_servings=4, servings=4, uncertainty=15,
  notes="Ready Spätzle (no transform) + cheese + cream. Röstzwiebeln topping estimated 30 g.",
  ingredients=[("1000 g","fertige Spätzle"),("Salz","für das Kochwasser"),
               ("250 g","würziger Hartkäse"),("75 g","Sahne"),("Prise","Muskat"),
               ("½ Bund","Schnittlauch"),("nach Bedarf","Röstzwiebeln")],
  comp=[("spaetzle",1000),("hard_cheese",250),("cream30",75),("roestzwiebeln",30)])

R(id="schnitzel", title="Schnitzel", category="hauptgerichte",
  db_servings=2, servings=2, uncertainty=20,
  notes="Breaded pork loin (700 g, midpoint of 600-800), deep-fried. Breading adhering "
        "estimated (flour 15, egg 40, breadcrumbs 60 g); oil uptake +6 g/100 g breaded.",
  ingredients=[("600-800 g","Schweinelende"),("nach Bedarf","Mehl"),("3–4 Stk.","Eier"),
               ("nach Geschmack","Salz/Pfeffer"),("Prise","Muskat"),
               ("nach Bedarf","Paniermehl"),("zum Frittieren","Pflanzenöl")],
  comp=[("pork_loin",700),("flour405",15),("egg_whole",40),("breadcrumbs",60)],
  oil_g=49)  # breaded ~815 g x 6%

R(id="spaghetti-bolognese", title="Spaghetti Bolognese (einfach)", category="hauptgerichte",
  db_servings=2, servings=2, uncertainty=18,
  notes="'Eine Packung' Nudeln unquantified -> estimated 250 g for 2 servings. "
        "Meat fat + 1 EL oil stay in sauce.",
  ingredients=[("Eine Packung","Nudeln"),("1 EL","Bratöl"),("400 g","Hackfleisch, gemischt"),
               ("400 g","Tomatensoße mit Basilikum"),("1 TL","Italienische Kräuter"),
               ("1 Prise","Zucker"),("nach Geschmack","Salz/Pfeffer")],
  comp=[("spaghetti_dry",250),("oil",14),("ground_meat",400),("tomato_sauce",400)])

R(id="tortilla-omelett", title="Tortilla-Omelett mit Tomate und Käse", category="snacks",
  db_servings=1, servings=1, uncertainty=15,
  notes="Single serving. Pan-fried in 1 TL butter (counted).",
  ingredients=[("1 Stk.","große Tortilla"),("1 TL","Butter"),("1 Stk.","kleine Tomate"),
               ("1 EL","Petersilie"),("2 Stk.","Eier"),("2 EL","Milch (optional)"),
               ("50 g","geriebener Käse"),("nach Bedarf","Salz/Pfeffer")],
  comp=[("tortilla",64),("butter",5),("tomato",100),("egg_whole",106),
        ("milk",30),("cheese_grated",50)])

R(id="mais-airfryer", title="Mais (Airfryer)", category="snacks",
  db_servings=2, servings=2, uncertainty=15,
  notes="2 cobs ~ 200 g kernels; 1 EL oil brushed on (stays).",
  ingredients=[("2 Stk.","Maiskolben"),("1 EL","Öl"),("0,5 TL","Salz")],
  comp=[("corn",200),("oil",14)])

R(id="lachscreme", title="Lachscreme", category="snacks",
  db_servings=4, servings=4, uncertainty=15,
  notes="Raw spread. Salmon 175 g (midpoint 150-200), crème fraîche 38 g (midpoint 25-50).",
  ingredients=[("150–200 g","Räucher/Stremellachs"),("200 g","Frischkäse"),
               ("½–1 Stk.","Zwiebel"),("1–2 TL","Zitronenschale"),
               ("25–50 g","Crème fraîche oder Schmand"),("nach Geschmack","Salz/Pfeffer")],
  comp=[("smoked_salmon",175),("cream_cheese",200),("onion",55),("creme_fraiche",38)])

# ---- Compute -----------------------------------------------------------------
def round1(x): return round(x, 1)

out = []
rows = []
for r in RECIPES:
    total = {k: 0.0 for k in KEYS}
    for c in r["comp"]:
        key, g = c[0], c[1]
        ret = c[2] if len(c) > 2 else None
        total = add(total, macros(key, g, ret))
    if r.get("oil_g"):
        total = add(total, oil_uptake(r["oil_g"]))
    per = {k: total[k] / r["servings"] for k in KEYS}
    # Atwater self-check
    atw = 4*per["protein_g"] + 9*per["fat_g"] + 4*per["carbs_g"]
    atw_dev = abs(atw - per["kcal"]) / per["kcal"] * 100 if per["kcal"] else 0
    per_r = {k: round1(per[k]) for k in KEYS}
    total_r = {k: round1(total[k]) for k in KEYS}
    out.append({
        "id": r["id"], "title": r["title"], "category_slug": r["category"],
        "servings": r["servings"],
        "ingredients": [{"amount": a, "name": n} for a, n in r["ingredients"]],
        "reference": {
            # per_recipe is the PRIMARY eval target (servings is unreliable and
            # divides out trivially for display). per_serving_derived is FYI only.
            "per_recipe": {k: total_r[k] for k in ("kcal","protein_g","fat_g","carbs_g","sugar_g","fibre_g")},
            "per_serving_derived": {k: per_r[k] for k in ("kcal","protein_g","fat_g","carbs_g","sugar_g","fibre_g")},
            "source": "computed:USDA+DE(BLS-aligned)",
            "uncertainty_pct": r["uncertainty"],
            "notes": r["notes"],
        },
    })
    rows.append((r["title"], r["servings"], per_r["kcal"], per_r["protein_g"],
                 per_r["fat_g"], per_r["carbs_g"], per_r["sugar_g"], per_r["fibre_g"],
                 r["uncertainty"], round(atw_dev)))

here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "recipes.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(f"{'recipe':38} {'srv':>3} {'kcal':>5} {'prot':>5} {'fat':>5} {'carb':>5} {'sug':>5} {'fib':>4} {'unc%':>4} {'atw%':>4}")
print("-"*92)
for row in rows:
    print(f"{row[0][:38]:38} {row[1]:>3} {row[2]:>5.0f} {row[3]:>5.1f} {row[4]:>5.1f} {row[5]:>5.1f} {row[6]:>5.1f} {row[7]:>4.1f} {row[8]:>4} {row[9]:>4}")
print(f"\nWrote recipes.json with {len(out)} reference recipes.")
