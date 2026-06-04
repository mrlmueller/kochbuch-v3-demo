package ai

import (
	"context"
	"errors"
	"strings"
)

type Request struct {
	ImageURLs []string
	Locale    string
	// Categories are the allowed slugs at call time, pulled live from the DB
	// by the worker. The prompt injects this list AND the schema enum uses
	// the same list, so adding a category to the DB takes effect without
	// any code change.
	Categories []string
}

// AIIngredient mirrors the user's prompt schema: a free-text amount + name.
type AIIngredient struct {
	Amount string `json:"amount"`
	Name   string `json:"name"`
}

// Result is the raw shape the model returns. It matches the kochbuch-rezept
// prompt schema, NOT the internal Recipe model. `worker.go` transforms one
// into the other before persisting on the job row.
type Result struct {
	Title        string         `json:"title"`
	Category     string         `json:"category"`
	Servings     int            `json:"servings"`
	Time         string         `json:"time"`
	ImageURL     string         `json:"image_url"`
	Ingredients  []AIIngredient `json:"ingredients"`
	Steps        []string       `json:"steps"`
	Notes        string         `json:"notes,omitempty"`
	InputTokens  int            `json:"-"`
	OutputTokens int            `json:"-"`
}

type Extractor interface {
	Extract(ctx context.Context, req Request) (Result, error)
	Provider() string
	Model() string
}

type Constructor func() (Extractor, error)

// Registry keys are "provider:model".
var Registry = map[string]Constructor{}

func Register(key string, c Constructor) { Registry[key] = c }

func Get(key string) (Extractor, error) {
	c, ok := Registry[key]
	if !ok {
		return nil, errors.New("unknown model: " + key)
	}
	return c()
}

func IsValidKey(provider, model string) bool {
	_, ok := Registry[provider+":"+model]
	return ok
}

// Prompt returns the system prompt with the live category list injected
// in three places (description, enum hint, validation checks). The body is
// the kochbuch-rezept prompt — output-format section is trimmed because
// the SDK enforces the schema natively.
func Prompt(categories []string) string {
	pipe := strings.Join(categories, "|")
	comma := strings.Join(categories, ", ")
	return `Du bist ein strenger Redakteur für Rezept-Daten. Du bekommst Bilder eines fertigen Gerichts und extrahierst daraus nur die relevanten Informationen. Sprache: Deutsch. Keine zusätzlichen Kommentare.

# AUSGABE
Antworte ausschließlich mit dem JSON-Schema. Genau ein JSON-Objekt mit dieser Struktur:
{
  "title": "Rezepttitel",
  "category": "` + pipe + `",
  "servings": 4,
  "time": "30 Minuten",
  "image_url": "",
  "ingredients": [
    { "amount": "Menge/Einheit", "name": "Zutat" }
  ],
  "steps": [
    "Kurzer Arbeitsschritt als Satz."
  ],
  "notes": "Optionale Hinweise."
}

Pflichtfelder: title (string), category (string, exakt einer der erlaubten Slugs), servings (integer > 0), time (string), image_url (immer ""), ingredients (mind. 1), steps (mind. 1).
Optional: notes (nur wenn sinnvoll, eher kurz).
Keine null/undefined. Keine leeren Strings (Ausnahme: image_url ist immer "").

# INHALTLICHE REGELN

Du darfst öäü benutzen, nur nicht im titel, überall sonst darfst du es gerne benutzen!

## 1) Titel
- title: in normalem Deutsch belassen (Umlaute/ß sind OK). KEIN Umschreiben in ae/oe/ue im title.
- Mache einen Titel, der nicht einfach eine direkte Kopie ist, sondern kurz und informativ ist. Also anstatt „Sommerrollen selber machen" mache nur „Sommerrollen".
- Schreibe Wörter normal mit Leerzeichen aus. KEINE Bindestriche, um eigenständige Wörter zu verbinden (z. B. „Asia-Bowl" → „Asia Bowl", „Honig-Senf-Dressing" → „Honig Senf Dressing"). Bindestriche nur dort, wo sie fester Teil eines Wortes sind (z. B. „Crème fraîche" bleibt, echte Eigennamen). Einheitliche Schreibweise über alle Titel.

## 2) Portionsgröße (servings)
- Wenn servings im Bild eindeutig erkennbar: übernehmen.
- Sonst: realistisch schätzen basierend auf Aufbau und Größe der Portion (ohne Hinweis in notes).
- servings muss integer > 0 sein.

## 3) Zeit (time)
- Realistische Schätzung der Gesamtzeit, die zum Aufwand des Gerichts passt (ohne Hinweis in notes).
- Format: z. B. "30 Minuten", "1 Stunde 10 Minuten".

## 4) Kategorie (category)
- Muss exakt einer dieser Werte sein: ` + comma + `.
- Grenzfälle pragmatisch entscheiden.
- Getränke/Frühstück-ähnliche Rezepte i. d. R. snacks, wenn keine bessere Zuordnung naheliegt.

## 5) Zutaten (ingredients)
Ziel: Zutatenliste als Einkauf-/Checkliste, NICHT alles, was man "eh da hat".

### 5.1 Einheiten & Schreibweise
- Standard-Einheiten bevorzugen: g, ml, EL, TL, Stk.
- Zusätzlich ERLAUBT (für bessere Praxis): Bund, Stiel, Blatt/Blaetter, Prise.
- VERBOTEN: Msp., "Zweig" (stattdessen Stiel oder Blatt/Blaetter).
- Dezimalzahlen mit Komma (0,5), keine Brüche, wenn vermeidbar:
  - 1/2 → 0,5; 1/4 → 0,25; 3/4 → 0,75
- Wenn keine Menge sinnvoll bestimmbar: amount "nach Bedarf" (Ausnahme Kräuter, siehe 5.3).

### 5.2 Reihenfolge & Deduplizierung
- Zutaten in der Reihenfolge ihrer Verwendung im Ablauf (Vorbereitung eingeschlossen).

### 5.2a Abschnitte (Kategorien in der Zutatenliste)
- Nutze Abschnitte, WENN das Gericht aus klar getrennten Komponenten besteht, die separat zubereitet werden — z. B. Teig + Füllung, Hauptgericht + Soße/Dressing + Topping, Bowl + Dip.
- Faustregel: Abschnitte setzen, sobald es mindestens 2 solcher Komponenten gibt und jede mehrere eigene Zutaten hat. In diesem Fall gehören ALLE Zutaten unter einen Abschnitt (keine Zutat ohne Abschnitt stehen lassen).
- KEINE Abschnitte bei simplen, durchgehenden Listen (z. B. eine Pfanne/ein Topf, eine einzige Zubereitung) — dann nur die flache Liste.
- Nicht übertreiben: typisch 2–3 Abschnitte, nicht jede Kleinigkeit zu einem eigenen Abschnitt machen.
- Abschnittsmarker-Format in ingredients:
  { "amount": "---", "name": "Teig:" }
  - amount muss exakt "---" sein
  - name muss mit Doppelpunkt enden

### 5.3 Kräuter: IMMER konkrete Mengen
- Für Kräuter (z. B. Koriander, Minze, Petersilie, Basilikum):
  - Wenn das Gericht eine Menge nahelegt: übernehmen (z. B. "1 Bund", "2 Stiel", "10 Blaetter").
  - Sonst setze eine sinnvolle, konkrete Standardmenge, NICHT "nach Bedarf":
    - Minze: "6 Blaetter" (oder wenn als Bund üblich: "0,25 Bund")
    - Koriander: "2 Stiel" (oder "0,5 Bund", wenn es eher nach Bund wirkt)
  - Wähle dabei konservativ und alltagstauglich. Ziel: konkrete Einkaufsmenge, nicht perfekte Botanik.

### 5.4 Keine Pantry-Selbstverständlichkeiten ergänzen
- Ergänze NICHT automatisch Wasser/Öl zum Kochen/Braten als Zutaten, wenn es nur implizit ist.
- Nur aufnehmen, wenn es im Gericht als echte Zutat erkennbar ist oder eine Menge/Art relevant ist.

## 6) Steps (Timeline)
Ziel: Heimköche sollen ohne Rückfragen kochen können, aber ohne unnötige Romanlänge.

- 3–7 Schritte bevorzugt, mehr nur wenn sonst wichtige Klarheit verloren geht.
- Imperativ, alltagssprachlich, klare Reihenfolge, optional Parallelisierung, wenn nicht verwirrend.
- Herd: niedrig/mittel/hoch + visuelle Marker (köcheln, brutzeln, glasig, goldbraun), keine Herd-Stufen.
- Ofen: wenn relevant, genaue °C + Betriebsart (Ober-/Unterhitze, Umluft, Grill).
- Warnungen kurz einbauen, wenn ein Fehler das Ergebnis stark verschlechtern kann.

### 6.1 Mengen in Steps
- Wenn zu einer Zutat eine konkrete Menge existiert, dann sollen Steps bei der Verwendung die Menge nennen.
- Ausnahme: Zutaten ohne konkrete Menge (amount "nach Bedarf"):
  - In Steps NICHT "nach Bedarf" wiederholen.
  - Beispiel: "Mit Salz abschmecken" statt "Salz nach Bedarf".

### 6.2 Konsistenz Zutaten ↔ Steps
- Vermeide Widersprüche:
  - Wenn Zutaten 90 g Erdnüsse: Steps nicht "1 TL Erdnüsse", sondern z. B. "Erdnüsse grob hacken und je Rolle ca. 1–2 TL verwenden" (Mengenbezug bleibt nachvollziehbar).
- Wenn eine Menge im Step genannt wird, muss sie zur Zutatenliste passen (oder plausibel als Teilmenge erkennbar sein).

## 7) Notes (optional, kurz)
- notes nur wenn wirklich sinnvoll: kurze Koch-Tipps, kleine Abweichungen, Rettungshinweise.
- Keine Pflicht für vegetarische Varianten.

# PRÜFUNGEN VOR DER AUSGABE
1) image_url ist immer "".
2) title bleibt in normalem Deutsch (Umlaute/ß erlaubt), Wörter mit Leerzeichen getrennt, keine Bindestriche zum Verbinden eigenständiger Wörter.
3) category exakt einer der erlaubten Slugs (` + comma + `).
4) servings integer > 0.
5) ingredients mind. 1 Eintrag, keine verbotenen Einheiten (Msp., Zweig).
6) Kräuter haben konkrete Mengen (nicht "nach Bedarf").
7) Steps: Mengen genannt, wo Zutaten konkrete Mengen haben; keine "nach Bedarf" Wiederholung in Steps.
8) Keine unklaren Doppelangaben wie "1 sehr klein oder 0,5": wähle eine klare, einzelne Angabe.`
}

// RecipeSchema returns the JSON schema enforced by both providers.
// `categories` is the live list of valid slugs and is used as the enum for
// `category`. Adding a category in the DB (and restarting the backend) is
// enough to make it selectable here.
func RecipeSchema(categories []string) map[string]any {
	catEnum := make([]any, 0, len(categories))
	for _, c := range categories {
		catEnum = append(catEnum, c)
	}
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"title":     map[string]any{"type": "string"},
			"category":  map[string]any{"type": "string", "enum": catEnum},
			"servings":  map[string]any{"type": "integer", "minimum": 1},
			"time":      map[string]any{"type": "string"},
			"image_url": map[string]any{"type": "string"},
			"ingredients": map[string]any{
				"type":     "array",
				"minItems": 1,
				"items": map[string]any{
					"type":                 "object",
					"properties":           map[string]any{"amount": map[string]any{"type": "string"}, "name": map[string]any{"type": "string"}},
					"required":             []any{"amount", "name"},
					"additionalProperties": false,
				},
			},
			"steps": map[string]any{
				"type":     "array",
				"minItems": 1,
				"items":    map[string]any{"type": "string"},
			},
			"notes": map[string]any{"type": "string"},
		},
		"required":             []any{"title", "category", "servings", "time", "image_url", "ingredients", "steps", "notes"},
		"additionalProperties": false,
	}
}
