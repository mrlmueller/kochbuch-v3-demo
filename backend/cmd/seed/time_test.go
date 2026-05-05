package main

import (
	"testing"
)

func TestParseTimeMinutes(t *testing.T) {
	cases := []struct {
		input string
		want  int
	}{
		{"30 Minuten", 30},
		{"45 Minuten", 45},
		{"1 Stunde", 60},
		{"2 Stunden", 120},
		{"1,5 Stunden", 90},
		{"1 Stunde 30 Minuten", 90},
		{"45–60 Minuten", 45},
		{"45-60 Minuten", 45},
		{"ca. 20 Minuten", 20},
		{"", 0},
		{"nach Bedarf", 0},
	}
	for _, c := range cases {
		got := parseTimeMinutes(c.input)
		if got != c.want {
			t.Errorf("parseTimeMinutes(%q) = %d, want %d", c.input, got, c.want)
		}
	}
}
