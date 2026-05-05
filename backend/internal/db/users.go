package db

import (
	"context"
	"errors"

	"backend/internal/models"
	"github.com/jackc/pgx/v5"
)

func (s *PostgresStore) GetUsers(ctx context.Context) ([]models.User, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, email, role, status, created_at, last_login FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := make([]models.User, 0)
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (s *PostgresStore) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, role, status, created_at, last_login FROM users WHERE email = $1`, email).
		Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

func (s *PostgresStore) CreateUser(ctx context.Context, email string, role models.Role) (*models.User, error) {
	var u models.User
	err := s.pool.QueryRow(ctx,
		`INSERT INTO users (email, role) VALUES ($1, $2)
		 RETURNING id, email, role, status, created_at, last_login`,
		email, role).
		Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin)
	return &u, err
}

func (s *PostgresStore) UpdateUser(ctx context.Context, id string, role models.Role, status models.Status) (*models.User, error) {
	var u models.User
	err := s.pool.QueryRow(ctx,
		`UPDATE users SET role=$2, status=$3 WHERE id=$1
		 RETURNING id, email, role, status, created_at, last_login`,
		id, role, status).
		Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

func (s *PostgresStore) DeleteUser(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	return err
}

func (s *PostgresStore) UpdateLastLogin(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `UPDATE users SET last_login = now() WHERE id = $1`, id)
	return err
}
