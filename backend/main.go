package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// HealthResponse defines the structure of our health response
type HealthResponse struct {
	Status    string `json:"status"`
	Timestamp string `json:"timestamp"`
}

// healthHandler handles GET /health
func healthHandler(w http.ResponseWriter, r *http.Request) {
	// Only allow GET requests
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	response := HealthResponse{
		Status:    "ok",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func main() {
	mux := http.NewServeMux()

	// Register routes
	mux.HandleFunc("/health", healthHandler)

	// Start server
	addr := ":8080"
	log.Printf("Server starting on http://localhost%s", addr)
	log.Printf("Health endpoint: http://localhost%s/health", addr)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}