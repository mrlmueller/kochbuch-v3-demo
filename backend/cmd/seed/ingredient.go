package main

import (
	"regexp"
	"strconv"
	"strings"

	"backend/internal/models"
)

// known units, longest-match first to avoid "g" matching inside "kg"
var knownUnits = []string{
	"EL", "TL", "kg", "ml", "cl", "dl", "Liter", "l",
	"Stück", "Stk", "Zehen", "Zehe", "Bund", "Prise",
	"Dose", "Packung", "Pkg", "Tasse", "g",
}

var rangeNumRe = regexp.MustCompile(`^(\d+(?:[,.]\d+)?)\s*[–\-]\s*\d+`)
var fracMap = map[string]float64{
	"½": 0.5, "¼": 0.25, "¾": 0.75,
	"⅓": 0.333, "⅔": 0.667,
}

func parseIngredient(amountStr, name string) models.Ingredient {
	display := strings.TrimSpace(amountStr)
	ing := models.Ingredient{Display: display, Name: name}

	for _, unit := range knownUnits {
		idx := strings.Index(display, unit)
		if idx < 0 {
			continue
		}
		numPart := strings.TrimSpace(display[:idx])
		unitPart := unit
		if amt, ok := parseFloat(numPart); ok {
			ing.Amount = amt
			ing.Unit = unitPart
			return ing
		}
	}

	// No unit found — try plain number
	if amt, ok := parseFloat(display); ok {
		ing.Amount = amt
	}
	return ing
}

func parseFloat(s string) (float64, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}

	// Fraction characters
	for frac, val := range fracMap {
		if strings.Contains(s, frac) {
			rest := strings.TrimSpace(strings.ReplaceAll(s, frac, ""))
			if rest == "" {
				return val, true
			}
			rest = strings.ReplaceAll(rest, ",", ".")
			if n, err := strconv.ParseFloat(rest, 64); err == nil {
				return n + val, true
			}
			return val, true
		}
	}

	// Range "1–2" → take lower
	if m := rangeNumRe.FindStringSubmatch(s); m != nil {
		s = m[1]
	}

	s = strings.ReplaceAll(s, ",", ".")
	if v, err := strconv.ParseFloat(s, 64); err == nil {
		return v, true
	}
	return 0, false
}
