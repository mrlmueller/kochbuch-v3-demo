package backup

import (
	"testing"
	"time"
)

func TestNextSundayUTC(t *testing.T) {
	tests := []struct {
		name string
		now  time.Time
		want time.Time
	}{
		{
			name: "Monday morning -> next Sunday",
			now:  time.Date(2026, 5, 4, 10, 0, 0, 0, time.UTC), // Monday
			want: time.Date(2026, 5, 10, 3, 0, 0, 0, time.UTC),
		},
		{
			name: "Saturday night -> tomorrow Sunday",
			now:  time.Date(2026, 5, 9, 23, 59, 0, 0, time.UTC), // Saturday
			want: time.Date(2026, 5, 10, 3, 0, 0, 0, time.UTC),
		},
		{
			name: "Sunday before 03:00 UTC -> today",
			now:  time.Date(2026, 5, 10, 2, 30, 0, 0, time.UTC), // Sunday 02:30
			want: time.Date(2026, 5, 10, 3, 0, 0, 0, time.UTC),
		},
		{
			name: "Sunday after 03:00 UTC -> next Sunday",
			now:  time.Date(2026, 5, 10, 4, 0, 0, 0, time.UTC), // Sunday 04:00
			want: time.Date(2026, 5, 17, 3, 0, 0, 0, time.UTC),
		},
		{
			name: "Sunday exactly 03:00 UTC -> next Sunday",
			now:  time.Date(2026, 5, 10, 3, 0, 0, 0, time.UTC),
			want: time.Date(2026, 5, 17, 3, 0, 0, 0, time.UTC),
		},
		{
			name: "non-UTC input is normalized",
			now:  time.Date(2026, 5, 4, 12, 0, 0, 0, time.FixedZone("CEST", 2*3600)), // 10:00 UTC Monday
			want: time.Date(2026, 5, 10, 3, 0, 0, 0, time.UTC),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := nextSundayUTC(tt.now)
			if !got.Equal(tt.want) {
				t.Errorf("nextSundayUTC(%v) = %v, want %v", tt.now, got, tt.want)
			}
		})
	}
}
