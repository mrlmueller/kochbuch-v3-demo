// Package email sends transactional email through the Resend HTTP API.
package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Sender delivers a transactional HTML email. Abstracted so callers are
// testable without hitting a live provider.
type Sender interface {
	Send(ctx context.Context, to, subject, html string) error
}

// ResendSender sends via the Resend API (https://resend.com).
type ResendSender struct {
	apiKey string
	from   string
	http   *http.Client
}

// NewResendSender builds a sender. from must be an address on a domain verified
// in Resend, e.g. "Mein Kochbuch <noreply@mail.kochbuch-v2.uk>".
func NewResendSender(apiKey, from string) *ResendSender {
	return &ResendSender{apiKey: apiKey, from: from, http: &http.Client{Timeout: 10 * time.Second}}
}

func (s *ResendSender) Send(ctx context.Context, to, subject, html string) error {
	body, err := json.Marshal(map[string]any{
		"from":    s.from,
		"to":      []string{to},
		"subject": subject,
		"html":    html,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("resend: status %d: %s", resp.StatusCode, string(snippet))
	}
	return nil
}
