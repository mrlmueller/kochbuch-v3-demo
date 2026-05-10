// ai-eval compares Claude (Sonnet 4.6, Haiku 4.5) and OpenAI (GPT-5.4 mini,
// nano) on a small set of reference dishes. Run once before promoting a
// default model. Skips models whose API key is missing.
//
//	ANTHROPIC_API_KEY=… OPENAI_API_KEY=… go run ./backend/cmd/ai-eval
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"backend/internal/ai"
	"backend/internal/models"
)

type dish struct {
	Name      string         `json:"name"`
	ImageURLs []string       `json:"image_urls"`
	Reference referenceShape `json:"reference"`
}

type referenceShape struct {
	Title            string   `json:"title"`
	CategorySlug     string   `json:"category_slug"`
	IngredientsNames []string `json:"ingredients_names"`
	StepCountMin     int      `json:"step_count_min"`
	StepCountMax     int      `json:"step_count_max"`
}

func main() {
	path := "backend/cmd/ai-eval/dishes.json"
	if v := os.Getenv("AI_EVAL_DISHES"); v != "" {
		path = v
	}
	f, err := os.Open(path)
	if err != nil {
		log.Fatalf("open %s: %v", path, err)
	}
	defer f.Close()
	var dishes []dish
	if err := json.NewDecoder(f).Decode(&dishes); err != nil {
		log.Fatalf("decode dishes: %v", err)
	}

	keys := []string{
		"openai:gpt-5.4-nano",
		"openai:gpt-5.4-mini",
		"claude:claude-haiku-4-5",
		"claude:claude-sonnet-4-6",
	}

	categories := []string{"hauptgang", "vorspeise", "dessert", "fruehstueck", "beilage", "suppe", "salat"}

	lines := []string{
		"| dish | model | title_match | ingr_jaccard | steps_ok | latency_ms | cost_usd |",
		"|---|---|---|---|---|---|---|",
	}
	summary := map[string]struct {
		count     int
		titleHits int
		jaccSum   float64
		stepsOK   int
		latency   int64
		cost      float64
	}{}

	for _, d := range dishes {
		for _, key := range keys {
			ext, err := ai.Get(key)
			if err != nil {
				log.Printf("skip %s: %v", key, err)
				continue
			}
			start := time.Now()
			res, err := ext.Extract(context.Background(), ai.Request{
				ImageURLs:  d.ImageURLs,
				Locale:     "de",
				Categories: categories,
			})
			elapsed := time.Since(start).Milliseconds()
			if err != nil {
				lines = append(lines, fmt.Sprintf("| %s | %s | ERR: %s | | | %d | |",
					escape(d.Name), key, escape(err.Error()), elapsed))
				continue
			}

			titleMatch := strings.EqualFold(strings.TrimSpace(res.Title), strings.TrimSpace(d.Reference.Title))
			jacc := jaccard(ingredientNames(res.Ingredients), d.Reference.IngredientsNames)
			stepsOK := len(res.Steps) >= d.Reference.StepCountMin && len(res.Steps) <= d.Reference.StepCountMax
			cost := ai.CostUSD(ext.Provider(), ext.Model(), res.InputTokens, res.OutputTokens)

			lines = append(lines, fmt.Sprintf("| %s | %s | %v | %.2f | %v | %d | %.4f |",
				escape(d.Name), key, titleMatch, jacc, stepsOK, elapsed, cost))

			s := summary[key]
			s.count++
			if titleMatch {
				s.titleHits++
			}
			s.jaccSum += jacc
			if stepsOK {
				s.stepsOK++
			}
			s.latency += elapsed
			s.cost += cost
			summary[key] = s
		}
	}

	lines = append(lines, "", "## Summary", "", "| model | dishes | title_match% | mean_jaccard | steps_ok% | mean_latency_ms | total_cost_usd |", "|---|---|---|---|---|---|---|")
	for _, key := range keys {
		s, ok := summary[key]
		if !ok || s.count == 0 {
			continue
		}
		lines = append(lines, fmt.Sprintf("| %s | %d | %d%% | %.2f | %d%% | %d | %.4f |",
			key, s.count,
			100*s.titleHits/s.count, s.jaccSum/float64(s.count),
			100*s.stepsOK/s.count, s.latency/int64(s.count), s.cost))
	}

	out := strings.Join(lines, "\n") + "\n"
	outPath := "backend/cmd/ai-eval/results.md"
	if err := os.WriteFile(outPath, []byte(out), 0644); err != nil {
		log.Fatalf("write %s: %v", outPath, err)
	}
	fmt.Println(out)
	fmt.Printf("→ written to %s\n", outPath)
}

func ingredientNames(items []models.Ingredient) []string {
	out := make([]string, 0, len(items))
	for _, i := range items {
		out = append(out, strings.ToLower(strings.TrimSpace(i.Name)))
	}
	return out
}

func jaccard(a, b []string) float64 {
	if len(a) == 0 && len(b) == 0 {
		return 1
	}
	set := map[string]bool{}
	for _, x := range a {
		set[x] = true
	}
	bSet := map[string]bool{}
	inter := 0
	for _, y := range b {
		if bSet[y] {
			continue
		}
		bSet[y] = true
		if set[y] {
			inter++
		}
	}
	union := len(set) + len(bSet) - inter
	if union == 0 {
		return 0
	}
	return float64(inter) / float64(union)
}

func escape(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "|", "\\|"), "\n", " ")
}
