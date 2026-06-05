// Command nutrition-modeleval compares nutrition estimators (model + effort) on
// a small fixed recipe sample, reporting kcal accuracy, tokens, cost and latency
// so we can choose the best model/effort for the production estimator.
//
// It deliberately runs only 3 recipes per config to keep Opus spend low.
// Usage: go run ./cmd/nutrition-modeleval   (needs ANTHROPIC_API_KEY)
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"time"

	"backend/internal/ai"
	"backend/internal/models"

	"github.com/joho/godotenv"
)

type evalRecipe struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Servings    any    `json:"servings"`
	Ingredients []struct {
		Amount string `json:"amount"`
		Name   string `json:"name"`
	} `json:"ingredients"`
	Steps     []string `json:"steps"`
	Reference struct {
		PerRecipe models.Macros `json:"per_recipe"`
	} `json:"reference"`
}

// Fixed 3-recipe sample, chosen to span distinct estimation challenges:
// baking (fat/sugar/flour + piece counts), frying (oil absorption + bone
// deduction), and pasta (dry-weight + meat sauce). Kept small on purpose.
var sample = []string{"amerikaner", "fried-chicken", "spaghetti-bolognese"}

type cfg struct {
	name  string
	model string
	est   ai.NutritionEstimator
}

type cell struct {
	kcal, ref, pct float64
	inTok, outTok  int
	cost           float64
	lat            time.Duration
	err            error
}

func toRecipe(er evalRecipe) models.Recipe {
	r := models.Recipe{Title: er.Title, Servings: fmt.Sprint(er.Servings), Steps: er.Steps}
	for _, ing := range er.Ingredients {
		r.Ingredients = append(r.Ingredients, models.Ingredient{Display: ing.Amount, Name: ing.Name})
	}
	return r
}

func main() {
	_ = godotenv.Load()
	if os.Getenv("ANTHROPIC_API_KEY") == "" {
		fmt.Println("ANTHROPIC_API_KEY not set")
		os.Exit(1)
	}

	raw, err := os.ReadFile(filepath.Join("cmd", "nutrition-eval", "recipes.json"))
	if err != nil {
		panic(err)
	}
	var all []evalRecipe
	if err := json.Unmarshal(raw, &all); err != nil {
		panic(err)
	}
	// "full" → every recipe + just the two finalists (current vs the probe winner).
	full := len(os.Args) > 1 && os.Args[1] == "full"

	byID := map[string]evalRecipe{}
	for _, r := range all {
		byID[r.ID] = r
	}
	var recipes []evalRecipe
	if full {
		recipes = all
	} else {
		for _, id := range sample {
			r, ok := byID[id]
			if !ok {
				fmt.Printf("WARN: sample recipe %q not found in recipes.json\n", id)
				continue
			}
			recipes = append(recipes, r)
		}
	}

	sonnet, err := ai.GetNutrition("claude:claude-sonnet-4-6")
	if err != nil {
		panic(err)
	}
	var configs []cfg
	if full {
		configs = []cfg{
			{name: "sonnet-4-6 (current)", model: "claude-sonnet-4-6", est: sonnet},
			{name: "opus-4-8 / high", model: "claude-opus-4-8", est: ai.NewClaudeNutrition("claude-opus-4-8", "high")},
		}
	} else {
		configs = []cfg{
			{name: "sonnet-4-6 (current)", model: "claude-sonnet-4-6", est: sonnet},
			{name: "opus-4-8 / low", model: "claude-opus-4-8", est: ai.NewClaudeNutrition("claude-opus-4-8", "low")},
			{name: "opus-4-8 / medium", model: "claude-opus-4-8", est: ai.NewClaudeNutrition("claude-opus-4-8", "medium")},
			{name: "opus-4-8 / high", model: "claude-opus-4-8", est: ai.NewClaudeNutrition("claude-opus-4-8", "high")},
		}
	}

	fmt.Printf("Sample (%d recipes): %v\n", len(recipes), sample)
	fmt.Printf("Running %d configs x %d recipes = %d calls\n\n", len(configs), len(recipes), len(configs)*len(recipes))

	grid := make([][]cell, len(configs))
	for ci, c := range configs {
		grid[ci] = make([]cell, len(recipes))
		for ri, er := range recipes {
			start := time.Now()
			res, err := c.est.Estimate(context.Background(), toRecipe(er))
			cl := cell{ref: er.Reference.PerRecipe.Kcal, lat: time.Since(start), err: err}
			if err == nil {
				cl.kcal = res.PerRecipe.Kcal
				cl.inTok, cl.outTok = res.InputTokens, res.OutputTokens
				cl.cost = ai.CostUSD("claude", c.model, res.InputTokens, res.OutputTokens)
				if cl.ref > 0 {
					cl.pct = (cl.kcal - cl.ref) / cl.ref * 100
				}
			}
			grid[ci][ri] = cl
			status := "ok"
			if err != nil {
				status = "ERR: " + err.Error()
			}
			fmt.Printf("  %-22s %-22s kcal %6.0f vs %6.0f  %+5.0f%%  in=%-6d out=%-6d $%.4f  %6dms  %s\n",
				c.name, er.ID, cl.kcal, cl.ref, cl.pct, cl.inTok, cl.outTok, cl.cost, cl.lat.Milliseconds(), status)
		}
		fmt.Println()
	}

	// Per-recipe kcal + error — recipe per row so it stays readable for 29 rows.
	fmt.Println("================ PER-RECIPE  kcal (error vs reference) ================")
	fmt.Printf("%-26s %7s", "recipe", "ref")
	for _, c := range configs {
		fmt.Printf("  | %-22s", c.name)
	}
	fmt.Println()
	for ri, er := range recipes {
		fmt.Printf("%-26s %7.0f", trunc(er.ID, 26), er.Reference.PerRecipe.Kcal)
		for ci := range configs {
			cl := grid[ci][ri]
			if cl.err != nil {
				fmt.Printf("  | %-22s", "ERR")
				continue
			}
			fmt.Printf("  | %6.0f (%+5.0f%%)       ", cl.kcal, cl.pct)
		}
		fmt.Println()
	}

	// Per-config summary
	fmt.Println("\n================ SUMMARY (per config) ================")
	fmt.Printf("%-22s  %7s  %9s  %9s  %9s  %6s\n", "config", "MAPE", "within20", "total$", "avg_ms", "fails")
	for ci, c := range configs {
		var n, hits, fails int
		var sumAbs, totCost float64
		var totMs int64
		for ri := range recipes {
			cl := grid[ci][ri]
			if cl.err != nil {
				fails++
				continue
			}
			if cl.ref <= 0 {
				continue
			}
			n++
			sumAbs += math.Abs(cl.pct)
			if math.Abs(cl.pct) <= 20 {
				hits++
			}
			totCost += cl.cost
			totMs += cl.lat.Milliseconds()
		}
		mape, within := math.NaN(), math.NaN()
		if n > 0 {
			mape = sumAbs / float64(n)
			within = 100 * float64(hits) / float64(n)
		}
		var avgMs int64
		if len(recipes) > 0 {
			avgMs = totMs / int64(len(recipes))
		}
		fmt.Printf("%-22s  %6.1f%%  %8.0f%%  %9.4f  %8dms  %6d\n",
			c.name, mape, within, totCost, avgMs, fails)
	}
}

func trunc(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
