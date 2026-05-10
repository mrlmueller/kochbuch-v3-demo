package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// GET /api/image-search?q=<query>
// Proxies SerpAPI's google_images engine so the API key stays server-side.
// SerpAPI is the pragmatic stand-in for Google Custom Search after Google
// closed the JSON API to new projects in 2025.
func ImageSearch() http.HandlerFunc {
	client := &http.Client{Timeout: 12 * time.Second}

	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		apiKey := os.Getenv("SERP_API_KEY")
		if apiKey == "" {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Bildsuche nicht konfiguriert: SERP_API_KEY fehlt",
			})
			return
		}

		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "q required"})
			return
		}

		u := url.URL{Scheme: "https", Host: "serpapi.com", Path: "/search"}
		qs := u.Query()
		qs.Set("engine", "google_images")
		qs.Set("q", q)
		qs.Set("api_key", apiKey)
		qs.Set("num", "20")
		qs.Set("ijn", "0")
		u.RawQuery = qs.Encode()

		res, err := client.Get(u.String())
		if err != nil {
			w.WriteHeader(http.StatusBadGateway)
			json.NewEncoder(w).Encode(map[string]string{"error": "image search failed: " + err.Error()})
			return
		}
		defer res.Body.Close()

		if res.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(res.Body)
			w.WriteHeader(http.StatusBadGateway)
			json.NewEncoder(w).Encode(map[string]string{
				"error":  "image search upstream " + res.Status,
				"detail": string(body),
			})
			return
		}

		var raw struct {
			ImagesResults []struct {
				Thumbnail      string `json:"thumbnail"`
				Original       string `json:"original"`
				Title          string `json:"title"`
				Link           string `json:"link"`
				OriginalWidth  int    `json:"original_width"`
				OriginalHeight int    `json:"original_height"`
			} `json:"images_results"`
		}
		if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
			w.WriteHeader(http.StatusBadGateway)
			json.NewEncoder(w).Encode(map[string]string{"error": "decode upstream: " + err.Error()})
			return
		}

		type Result struct {
			URL       string `json:"url"`
			Thumb     string `json:"thumb"`
			Title     string `json:"title"`
			Width     int    `json:"width"`
			Height    int    `json:"height"`
			SourceURL string `json:"source_url"`
		}
		// Cap at 20 — UI shows a 2-col grid; more than that is just scroll.
		max := len(raw.ImagesResults)
		if max > 20 {
			max = 20
		}
		out := make([]Result, 0, max)
		for _, it := range raw.ImagesResults[:max] {
			if it.Original == "" {
				continue
			}
			out = append(out, Result{
				URL:       it.Original,
				Thumb:     it.Thumbnail,
				Title:     it.Title,
				Width:     it.OriginalWidth,
				Height:    it.OriginalHeight,
				SourceURL: it.Link,
			})
		}

		json.NewEncoder(w).Encode(map[string]any{"items": out})
	}
}
