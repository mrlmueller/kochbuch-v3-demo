// Command nutrition-eval scores the production estimator against the committed
// ground-truth sets. Usage: go run ./cmd/nutrition-eval [recipes.json|recipes_external.json]
//
// It exercises the live internal/ai nutrition estimator (needs ANTHROPIC_API_KEY)
// against the hand-built and external reference recipes, reporting kcal MAPE and
// the share within ±20% — the regression gate before any prompt/model change.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"

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

func main() {
	_ = godotenv.Load()
	set := "recipes.json"
	if len(os.Args) > 1 {
		set = os.Args[1]
	}
	path := set
	if !filepath.IsAbs(set) {
		path = filepath.Join("cmd", "nutrition-eval", filepath.Base(set))
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		panic(err)
	}
	var recipes []evalRecipe
	if err := json.Unmarshal(raw, &recipes); err != nil {
		panic(err)
	}

	est, err := ai.GetNutrition("claude:claude-opus-4-8") // production nutrition model
	if err != nil {
		panic(err)
	}

	var n int
	var sumAbsPct, hits float64
	for _, er := range recipes {
		r := models.Recipe{Title: er.Title, Servings: fmt.Sprint(er.Servings), Steps: er.Steps}
		for _, ing := range er.Ingredients {
			r.Ingredients = append(r.Ingredients, models.Ingredient{Display: ing.Amount, Name: ing.Name})
		}
		res, err := est.Estimate(context.Background(), r)
		if err != nil {
			fmt.Printf("  FAIL %s: %v\n", er.ID, err)
			continue
		}
		ref := er.Reference.PerRecipe.Kcal
		if ref <= 0 {
			continue
		}
		pct := (res.PerRecipe.Kcal - ref) / ref * 100
		n++
		sumAbsPct += math.Abs(pct)
		if math.Abs(pct) <= 20 {
			hits++
		}
		fmt.Printf("  %-34s kcal %6.0f vs %6.0f  (%+5.0f%%)\n", trunc(er.Title, 34), res.PerRecipe.Kcal, ref, pct)
	}
	if n == 0 {
		fmt.Println("no scorable recipes")
		return
	}
	fmt.Printf("\n=== %s: n=%d  kcal MAPE %.1f%%  within20 %.0f%% ===\n",
		set, n, sumAbsPct/float64(n), 100*hits/float64(n))
}

func trunc(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
