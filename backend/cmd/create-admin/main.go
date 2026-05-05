package main

import (
	"context"
	"log"
	"os"

	"backend/internal/db"
	"backend/internal/models"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load(".env")

	email := os.Getenv("ADMIN_EMAIL")
	if email == "" {
		log.Fatal("ADMIN_EMAIL env var required")
	}

	ctx := context.Background()
	pool, err := db.NewPool(ctx)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()
	store := db.NewPostgresStore(pool)

	existing, _ := store.GetUserByEmail(ctx, email)
	if existing != nil {
		_, err = store.UpdateUser(ctx, existing.ID, models.RoleAdmin, models.StatusActive)
		if err != nil {
			log.Fatalf("update user: %v", err)
		}
		log.Printf("Updated existing user %s to admin/active", email)
		return
	}

	user, err := store.CreateUser(ctx, email, models.RoleAdmin)
	if err != nil {
		log.Fatalf("create user: %v", err)
	}
	log.Printf("Created admin user: %s (id: %s)", user.Email, user.ID)
}
