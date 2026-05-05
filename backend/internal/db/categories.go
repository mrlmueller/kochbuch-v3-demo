package db

import (
	"context"

	"backend/internal/models"
)

func (s *PostgresStore) GetCategories(ctx context.Context) ([]models.Category, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT slug, name, description, accent FROM categories ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []models.Category
	for rows.Next() {
		var c models.Category
		if err := rows.Scan(&c.Slug, &c.Name, &c.Description, &c.Accent); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, rows.Err()
}
