package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

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

		// Recipe writes — any authed user; ownership is enforced inside.
		r.Post("/api/recipes", handlers.CreateRecipe(store))
		r.Put("/api/recipes/{slug}", handlers.UpdateRecipe(store))
		r.Delete("/api/recipes/{slug}", handlers.DeleteRecipe(store))

		// Admin-only (require admin role)
		r.Group(func(r chi.Router) {
			r.Use(mw.RequireAdmin)
			r.Get("/api/admin/recipes", handlers.ListAdminRecipes(store))
			r.Get("/api/admin/users", handlers.ListUsers(store))
			r.Post("/api/admin/users", handlers.CreateUser(store))
			r.Patch("/api/admin/users/{id}", handlers.UpdateUser(store))
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
