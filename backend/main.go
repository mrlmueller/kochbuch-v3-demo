package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"

	"backend/internal/ai"
	"backend/internal/backup"
	"backend/internal/db"
	"backend/internal/handlers"
	mw "backend/internal/middleware"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
	"github.com/pressly/goose/v3"
)

func main() {
	_ = godotenv.Load()
	ctx := context.Background()

	if err := runMigrations(); err != nil {
		log.Fatalf("migrations failed: %v", err)
	}

	pool, err := db.NewPool(ctx)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()
	store := db.NewPostgresStore(pool)

	// Weekly recipe backups to GitHub. Skips if env vars are missing.
	go backup.RunWeekly(ctx, store,
		os.Getenv("BACKUP_GITHUB_OWNER"),
		os.Getenv("BACKUP_GITHUB_REPO"),
		os.Getenv("BACKUP_GITHUB_TOKEN"))

	aiLimits := handlers.AIJobLimits{
		PerUserActive:   intEnv("AI_PER_USER_ACTIVE_LIMIT", 3),
		GlobalActive:    intEnv("AI_GLOBAL_QUEUE_LIMIT", 50),
		DailyPerUser:    intEnv("AI_PER_USER_DAILY_LIMIT", 25),
		DefaultProvider: getenv("AI_DEFAULT_PROVIDER", "openai"),
		DefaultModel:    getenv("AI_DEFAULT_MODEL", "gpt-5.4-mini"),
	}

	workerPool := ai.NewWorkerPool(store, ai.WorkerOpts{
		Workers: intEnv("AI_WORKERS", 2),
		Categories: func(ctx context.Context) ([]string, error) {
			cats, err := store.GetCategories(ctx)
			if err != nil {
				return nil, err
			}
			out := make([]string, 0, len(cats))
			for _, c := range cats {
				out = append(out, c.Slug)
			}
			return out, nil
		},
	})
	go func() {
		if err := workerPool.Start(ctx); err != nil && !errors.Is(err, context.Canceled) {
			log.Printf("ai worker pool: %v", err)
		}
	}()

	// Firebase Auth client (optional in dev if GOOGLE_APPLICATION_CREDENTIALS not set)
	firebaseAuth, err := mw.InitFirebase(ctx)
	if err != nil {
		log.Fatalf("firebase init: %v", err)
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	allowedOrigins := []string{"http://localhost:3000"}
	if origin := os.Getenv("ALLOWED_ORIGIN"); origin != "" {
		allowedOrigins = append(allowedOrigins, origin)
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Auth (public)
	r.Post("/api/auth/login", handlers.Login(store, firebaseAuth))
	r.Post("/api/auth/logout", handlers.Logout(store))

	// Protected routes (require valid session cookie)
	r.Group(func(r chi.Router) {
		r.Use(mw.RequireSession(store, os.Getenv("INTERNAL_TOKEN")))

		r.Get("/api/auth/me", handlers.Me())
		r.Get("/api/categories", handlers.ListCategories(store))
		r.Get("/api/recipes", handlers.ListRecipes(store))
		r.Get("/api/recipes/{slug}", handlers.GetRecipe(store))
		r.Get("/api/image-search", handlers.ImageSearch())

		// Recipe writes — any authed user; ownership is enforced inside.
		r.Post("/api/recipes", handlers.CreateRecipe(store))
		r.Put("/api/recipes/{slug}", handlers.UpdateRecipe(store))
		r.Delete("/api/recipes/{slug}", handlers.DeleteRecipe(store))

		// AI jobs (image-to-recipe)
		r.Post("/api/ai-jobs", handlers.CreateAIJob(store, aiLimits))
		r.Get("/api/ai-jobs", handlers.ListAIJobs(store, aiLimits))
		r.Get("/api/ai-jobs/{id}", handlers.GetAIJob(store))
		r.Delete("/api/ai-jobs/{id}", handlers.DeleteAIJob(store))
		r.Post("/api/ai-jobs/{id}/consume", handlers.ConsumeAIJob(store))

		// Admin-only (require admin role)
		r.Group(func(r chi.Router) {
			r.Use(mw.RequireAdmin)
			r.Get("/api/admin/recipes", handlers.ListAdminRecipes(store))
			r.Get("/api/admin/recipes/status", handlers.ListRecipeConfirmations(store))
			r.Patch("/api/admin/recipes/{slug}/confirm", handlers.SetRecipeConfirmed(store))
			r.Get("/api/admin/ai-stats", handlers.GetAIStats(store))
			r.Get("/api/admin/users", handlers.ListUsers(store))
			r.Get("/api/admin/users/{id}", handlers.GetUserDetail(store, aiLimits))
			r.Post("/api/admin/users", handlers.CreateUser(store))
			r.Patch("/api/admin/users/{id}", handlers.UpdateUser(store))
			r.Patch("/api/admin/users/{id}/ai-limit", handlers.SetUserAILimit(store))
			r.Delete("/api/admin/users/{id}", handlers.DeleteUser(store))
			r.Post("/api/admin/backup", handlers.TriggerBackup(store))
		})
	})

	addr := os.Getenv("SERVER_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("server listening on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func runMigrations() error {
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"), os.Getenv("DB_SSLMODE"))
	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer sqlDB.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	if err := goose.Up(sqlDB, "migrations"); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	log.Println("migrations OK")
	return nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func intEnv(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
