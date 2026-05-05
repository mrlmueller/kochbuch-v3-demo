package models

type Category struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Accent      string `json:"accent"`
}
