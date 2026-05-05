package main

import (
	"regexp"
	"strconv"
	"strings"
)

var (
	rangeRe  = regexp.MustCompile(`(\d+)\s*[–\-]\s*\d+`)
	hourRe   = regexp.MustCompile(`(\d+(?:[,.]\d+)?)\s*[Ss]tunde[n]?`)
	minuteRe = regexp.MustCompile(`(\d+(?:[,.]\d+)?)\s*[Mm]inuten?`)
)

func parseTimeMinutes(s string) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}

	// Ranges like "45–60 Minuten" → take lower bound
	if m := rangeRe.FindStringSubmatch(s); m != nil {
		if v, err := strconv.Atoi(m[1]); err == nil {
			return v
		}
	}

	total := 0

	// Hours: "1 Stunde", "1,5 Stunden", "2 Stunden"
	if m := hourRe.FindStringSubmatch(s); m != nil {
		numStr := strings.ReplaceAll(m[1], ",", ".")
		if v, err := strconv.ParseFloat(numStr, 64); err == nil {
			total += int(v * 60)
		}
	}

	// Minutes: "30 Minuten", "ca. 20 Minuten"
	if m := minuteRe.FindStringSubmatch(s); m != nil {
		numStr := strings.ReplaceAll(m[1], ",", ".")
		if v, err := strconv.ParseFloat(numStr, 64); err == nil {
			total += int(v)
		}
	}

	return total
}
