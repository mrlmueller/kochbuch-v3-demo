// ai-smoke makes one real Extract call per registered model and prints the
// result. Used to verify SDK call sites end-to-end against live APIs.
//
//	cd backend && go run ./cmd/ai-smoke
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"backend/internal/ai"

	"github.com/joho/godotenv"
)

// A public food image (Pexels — pasta with tomato sauce).
const sampleImage = "https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg?auto=compress&cs=tinysrgb&w=640"

var sampleCategories = []string{
	"hauptgerichte",
	"grundrezepte-und-saucen",
	"backen-und-suesses",
	"snacks",
}

func main() {
	_ = godotenv.Load("backend/.env")
	_ = godotenv.Load(".env")

	keys := []string{
		"claude:claude-haiku-4-5",
		"claude:claude-sonnet-4-6",
		"openai:gpt-5.4-mini",
		"openai:gpt-5.4-nano",
	}

	for _, key := range keys {
		fmt.Printf("\n=== %s ===\n", key)
		ext, err := ai.Get(key)
		if err != nil {
			fmt.Printf("  init error: %v\n", err)
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		start := time.Now()
		res, err := ext.Extract(ctx, ai.Request{
			ImageURLs:  []string{sampleImage},
			Locale:     "de",
			Categories: sampleCategories,
		})
		elapsed := time.Since(start)
		cancel()
		if err != nil {
			fmt.Printf("  extract error after %v: %v\n", elapsed, err)
			continue
		}
		fmt.Printf("  title: %s\n", res.Title)
		fmt.Printf("  category: %s\n", res.Category)
		fmt.Printf("  time: %s, servings: %d\n", res.Time, res.Servings)
		fmt.Printf("  ingredients: %d, steps: %d\n", len(res.Ingredients), len(res.Steps))
		if len(res.Ingredients) > 0 {
			names := make([]string, 0, len(res.Ingredients))
			for _, i := range res.Ingredients {
				names = append(names, i.Name)
			}
			fmt.Printf("  → %s\n", strings.Join(names, ", "))
		}
		fmt.Printf("  tokens in/out: %d/%d, cost: $%.5f, latency: %v\n",
			res.InputTokens, res.OutputTokens,
			ai.CostUSD(ext.Provider(), ext.Model(), res.InputTokens, res.OutputTokens),
			elapsed.Round(time.Millisecond))
	}

	// Also emit the raw JSON of the last result for debugging.
	_ = os.Stdout
	_ = json.Marshal
}
