package db

import (
	"context"
	"errors"
	"time"

	"backend/internal/models"
	"github.com/jackc/pgx/v5"
)

func (s *PostgresStore) CreateSession(ctx context.Context, userID, token string, expires time.Time, ua, ip string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO sessions (user_id, token, expires_at, user_agent, ip) VALUES ($1,$2,$3,$4,$5)`,
		userID, token, expires, ua, ip)
	return err
}

func (s *PostgresStore) GetUserBySessionToken(ctx context.Context, token string) (*models.User, error) {
	var u models.User
	err := s.pool.QueryRow(ctx, `
		SELECT u.id, u.email, u.role, u.status, u.created_at, u.last_login
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token = $1 AND s.expires_at > now()`, token).
		Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

func (s *PostgresStore) DeleteSession(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE token = $1`, token)
	return err
}

func (s *PostgresStore) DeleteSessionsByUserID(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}
