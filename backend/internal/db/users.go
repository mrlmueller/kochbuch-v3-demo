package db

import (
	"context"
	"errors"

	"backend/internal/models"
	"github.com/jackc/pgx/v5"
)

func (s *PostgresStore) GetUsers(ctx context.Context) ([]models.User, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, email, role, status, created_at, last_login, last_active_at, auth_method FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := make([]models.User, 0)
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin, &u.LastActiveAt, &u.AuthMethod); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (s *PostgresStore) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, role, status, created_at, last_login, last_active_at, auth_method FROM users WHERE email = $1`, email).
		Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin, &u.LastActiveAt, &u.AuthMethod)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

func (s *PostgresStore) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	var u models.User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, role, status, created_at, last_login, last_active_at, auth_method FROM users WHERE id = $1`, id).
		Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin, &u.LastActiveAt, &u.AuthMethod)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

func (s *PostgresStore) CreateUser(ctx context.Context, email string, role models.Role, authMethod models.AuthMethod) (*models.User, error) {
	var u models.User
	err := s.pool.QueryRow(ctx,
		`INSERT INTO users (email, role, auth_method) VALUES ($1, $2, $3)
		 RETURNING id, email, role, status, created_at, last_login, last_active_at, auth_method`,
		email, role, authMethod).
		Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin, &u.LastActiveAt, &u.AuthMethod)
	return &u, err
}

func (s *PostgresStore) SetUserAuthMethod(ctx context.Context, id string, method models.AuthMethod) error {
	_, err := s.pool.Exec(ctx, `UPDATE users SET auth_method = $2 WHERE id = $1`, id, method)
	return err
}

func (s *PostgresStore) UpdateUser(ctx context.Context, id string, role models.Role, status models.Status) (*models.User, error) {
	var u models.User
	err := s.pool.QueryRow(ctx,
		`UPDATE users SET role=$2, status=$3 WHERE id=$1
		 RETURNING id, email, role, status, created_at, last_login, last_active_at, auth_method`,
		id, role, status).
		Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin, &u.LastActiveAt, &u.AuthMethod)
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

func (s *PostgresStore) UpdateLastActive(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `UPDATE users SET last_active_at = now() WHERE id = $1`, id)
	return err
}
