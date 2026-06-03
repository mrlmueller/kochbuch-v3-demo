package ai

import (
	"math"
	"testing"

	"backend/internal/models"
)

func approx(a, b float64) bool { return math.Abs(a-b) < 0.05 }

func TestSumLineItems(t *testing.T) {
	items := []models.NutritionLineItem{
		{Ingredient: "Butter", Grams: 100, Per100g: models.Macros{Kcal: 717, FatG: 81}},
		{Ingredient: "Zucker", Grams: 50, Per100g: models.Macros{Kcal: 400, CarbsG: 100, SugarG: 100}},
	}
	got := sumLineItems(items)
	if !approx(got.Kcal, 917) || !approx(got.FatG, 81) || !approx(got.CarbsG, 50) || !approx(got.SugarG, 50) {
		t.Fatalf("sum wrong: %+v", got)
	}
}

func TestParseServings(t *testing.T) {
	cases := map[string]float64{
		"4 Personen": 4, "1 Person": 1, "12 Portionen": 12,
		"2 cups (240 g)": 2, "": 0, "nach Bedarf": 0, "ca. 6": 6,
	}
	for in, want := range cases {
		if got := parseServings(in); got != want {
			t.Errorf("parseServings(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestPerServing(t *testing.T) {
	per := models.Macros{Kcal: 800, ProteinG: 40}
	got := divideMacros(per, 4)
	if !approx(got.Kcal, 200) || !approx(got.ProteinG, 10) {
		t.Fatalf("divide wrong: %+v", got)
	}
	// servings 0 → unchanged (fall back to whole recipe)
	if got := divideMacros(per, 0); !approx(got.Kcal, 800) {
		t.Fatalf("divide by 0 should be identity: %+v", got)
	}
}
