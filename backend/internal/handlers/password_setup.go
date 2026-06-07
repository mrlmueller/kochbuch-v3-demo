package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"

	"backend/internal/db"
	"backend/internal/email"
	"backend/internal/models"

	"firebase.google.com/go/v4/auth"
)

// SetupMailer sends the initial password-setup email — our own email (via the
// transactional provider) carrying a link to the in-app /auth/action handler,
// so the password the user sets is saved by their password manager under our
// origin (and the mail comes from our domain, not firebaseapp.com).
//
// Password *resets* are deliberately left to Firebase's built-in email.
type SetupMailer interface {
	SendSetupLink(ctx context.Context, email string) error
}

type setupMailer struct {
	auth        *auth.Client
	sender      email.Sender
	frontendURL string
}

// NewSetupMailer wires the Firebase Admin client, the email sender, and the
// frontend base URL used to build the action link.
func NewSetupMailer(a *auth.Client, sender email.Sender, frontendURL string) SetupMailer {
	return &setupMailer{auth: a, sender: sender, frontendURL: frontendURL}
}

func (m *setupMailer) SendSetupLink(ctx context.Context, addr string) error {
	link, err := m.auth.PasswordResetLink(ctx, addr)
	if err != nil {
		return err
	}
	actionURL, err := buildSetupURL(link, m.frontendURL)
	if err != nil {
		return err
	}
	return m.sender.Send(ctx, addr, setupEmailSubject, renderSetupEmail(actionURL))
}

// buildSetupURL rewrites a Firebase-generated action link to point at our own
// /auth/action handler, preserving the one-time oobCode (which is project-scoped
// and therefore valid from any origin). Returns an error if there is no oobCode.
func buildSetupURL(firebaseLink, frontendURL string) (string, error) {
	u, err := url.Parse(firebaseLink)
	if err != nil {
		return "", err
	}
	code := u.Query().Get("oobCode")
	if code == "" {
		return "", fmt.Errorf("buildSetupURL: link has no oobCode")
	}
	base := strings.TrimRight(frontendURL, "/")
	return fmt.Sprintf("%s/auth/action?mode=resetPassword&oobCode=%s", base, url.QueryEscape(code)), nil
}

// RequestPasswordSetup is the public endpoint that (re)sends the initial
// password-setup email. It always returns 200 so it cannot be used to probe
// which emails are registered, and only actually sends for an active,
// allowlisted password account.
//
// POST /api/auth/request-password-setup  body: {"email":"..."}
func RequestPasswordSetup(store db.Store, mailer SetupMailer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email string `json:"email"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Email == "" {
			http.Error(w, `{"error":"email required"}`, http.StatusBadRequest)
			return
		}

		user, _ := store.GetUserByEmail(r.Context(), body.Email)
		active := user != nil && user.Status != models.StatusDeactivated && user.AuthMethod != nil

		// "sent" is the neutral response — returned for password accounts AND for
		// unknown/deactivated emails, so it can't reveal whether an address is
		// registered. We single out only Google accounts so the UI can point the
		// user at the Google button (a deliberate, minimal disclosure).
		status := "sent"
		switch {
		case active && *user.AuthMethod == models.AuthGoogle:
			status = "use_google"
			log.Printf("password-setup: %s uses google — advising google sign-in", body.Email)
		case active && *user.AuthMethod == models.AuthPassword:
			if err := mailer.SendSetupLink(r.Context(), body.Email); err != nil {
				log.Printf("password-setup: send to %s FAILED: %v", body.Email, err)
			} else {
				log.Printf("password-setup: setup link sent to %s", body.Email)
			}
		default:
			log.Printf("password-setup: skipped %s (no active account)", body.Email)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"` + status + `"}`))
	}
}
