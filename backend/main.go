package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"backend/internal/ai"
	"backend/internal/backup"
	"backend/internal/db"
	"backend/internal/email"
	"backend/internal/handlers"
	mw "backend/internal/middleware"
	"backend/internal/models"

	"firebase.google.com/go/v4/auth"
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
		RevalidateRecipe: revalidateRecipeFunc(
			os.Getenv("FRONTEND_URL"), os.Getenv("INTERNAL_TOKEN")),
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

	// Pre-lock existing users to their real Firebase provider so the per-email
	// method enforcement in Login cannot be raced. Idempotent and non-fatal.
	go backfillAuthMethods(ctx, store, firebaseAuth)

	// Initial password-setup email (Resend). Resets stay on Firebase's built-in
	// email; this only carries the first-time setup link to our /auth/action page.
	emailSender := email.NewResendSender(os.Getenv("RESEND_API_KEY"),
		"Mein Kochbuch <"+os.Getenv("RESEND_FROM")+">")
	setupMailer := handlers.NewSetupMailer(firebaseAuth, emailSender, os.Getenv("FRONTEND_URL"))

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	// Gzip JSON responses (level 5). The recipe list alone is ~54 KB raw and
	// travels Vercel ⇄ tunnel ⇄ Caddy on every SSR cache miss and proxy read —
	// compression cuts that ~80%. Only kicks in when the client sends
	// Accept-Encoding (fetch/undici do by default).
	r.Use(middleware.Compress(5))
	// In production set ALLOWED_ORIGIN (comma-separated allowed). When it is set
	// we do NOT also trust http://localhost:3000 — that dev origin is only added
	// as the fallback when ALLOWED_ORIGIN is unset (local development).
	var allowedOrigins []string
	if origins := os.Getenv("ALLOWED_ORIGIN"); origins != "" {
		for _, o := range strings.Split(origins, ",") {
			if o = strings.TrimSpace(o); o != "" {
				allowedOrigins = append(allowedOrigins, o)
			}
		}
	} else {
		allowedOrigins = []string{"http://localhost:3000"}
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
	// Single-session is enforced by default; set ENFORCE_SINGLE_SESSION=false
	// (e.g. in local dev) to allow the same user in multiple browsers.
	enforceSingleSession := os.Getenv("ENFORCE_SINGLE_SESSION") != "false"
	r.Post("/api/auth/login", handlers.Login(store, firebaseAuth, enforceSingleSession))
	r.Post("/api/auth/logout", handlers.Logout(store))
	r.Post("/api/auth/request-password-setup", handlers.RequestPasswordSetup(store, setupMailer))

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
			r.Post("/api/admin/recipes/{slug}/nutrition", handlers.EnqueueRecipeNutrition(store))
			r.Get("/api/admin/recipes/{slug}/nutrition", handlers.GetRecipeNutrition(store))
			r.Get("/api/admin/ai-stats", handlers.GetAIStats(store))
			r.Get("/api/admin/users", handlers.ListUsers(store))
			r.Get("/api/admin/users/{id}", handlers.GetUserDetail(store, aiLimits))
			r.Post("/api/admin/users", handlers.CreateUser(store, handlers.NewFirebaseProvisioner(firebaseAuth), setupMailer))
			r.Patch("/api/admin/users/{id}", handlers.UpdateUser(store))
			r.Patch("/api/admin/users/{id}/ai-limit", handlers.SetUserAILimit(store))
			r.Delete("/api/admin/users/{id}", handlers.DeleteUser(store, handlers.NewFirebaseProvisioner(firebaseAuth)))
			r.Post("/api/admin/backup", handlers.TriggerBackup(store))
		})
	})

	addr := os.Getenv("SERVER_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	// Explicit timeouts so a stalled or malicious client can't hold a
	// connection (and its goroutine) open forever. WriteTimeout must cover
	// the slowest handler: the manual backup trigger runs synchronously and
	// its GitHub push alone may take up to 30s.
	srv := &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      90 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	log.Printf("server listening on %s", addr)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

// revalidateRecipeFunc returns the worker callback that busts the frontend's
// SSR cache for one recipe (POST {FRONTEND_URL}/api/revalidate-recipe with the
// shared internal token). Returns nil — disabling revalidation — when either
// env var is missing, e.g. in local dev. Best-effort: failures are logged,
// never propagated; the admin tab's own revalidation remains as a fallback.
func revalidateRecipeFunc(frontendURL, token string) func(context.Context, string) {
	if frontendURL == "" || token == "" {
		return nil
	}
	endpoint := strings.TrimRight(frontendURL, "/") + "/api/revalidate-recipe"
	client := &http.Client{Timeout: 10 * time.Second}
	return func(ctx context.Context, slug string) {
		body, err := json.Marshal(map[string]string{"slug": slug})
		if err != nil {
			return
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			log.Printf("revalidate %s: %v", slug, err)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Internal-Token", token)
		res, err := client.Do(req)
		if err != nil {
			log.Printf("revalidate %s: %v", slug, err)
			return
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			log.Printf("revalidate %s: frontend returned HTTP %d", slug, res.StatusCode)
		}
	}
}

// backfillAuthMethods locks each user with a NULL auth_method to its real
// Firebase provider. Idempotent (only touches NULL rows) and non-fatal: it logs
// and continues on per-user errors. This pre-locks existing users so the method
// enforcement in Login cannot be raced by a password pre-claim.
func backfillAuthMethods(ctx context.Context, store db.Store, fb *auth.Client) {
	users, err := store.GetUsers(ctx)
	if err != nil {
		log.Printf("backfill auth_method: list users: %v", err)
		return
	}
	for _, u := range users {
		if u.AuthMethod != nil {
			continue
		}
		rec, err := fb.GetUserByEmail(ctx, u.Email)
		if err != nil {
			continue // no Firebase account yet, or transient — leave NULL
		}
		method := models.AuthGoogle
		found := false
		hasPassword := false
		for _, p := range rec.ProviderUserInfo {
			switch p.ProviderID {
			case "google.com":
				method, found = models.AuthGoogle, true
			case "password":
				hasPassword = true
			}
		}
		if !found && hasPassword {
			method, found = models.AuthPassword, true
		}
		if !found {
			continue
		}
		if err := store.SetUserAuthMethod(ctx, u.ID, method); err != nil {
			log.Printf("backfill auth_method: set %s: %v", u.Email, err)
		}
	}
	log.Printf("backfill auth_method: done")
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
