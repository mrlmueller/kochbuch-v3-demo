// Package cloudinary signs and issues destroy calls against the Cloudinary
// REST API. The upload path is in the Next.js layer; only deletion runs here
// (where DB lifecycle events live).
package cloudinary

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var versionSegment = regexp.MustCompile(`^v\d+$`)

// transform segments look like `w_300,f_auto,q_auto` — comma-separated
// `key_value` chunks. We use the comma presence + underscore form to
// distinguish from the public_id folder/file segments.
var transformSegment = regexp.MustCompile(`^[a-z]+_[^/]+$`)

// PublicIDFromURL extracts the Cloudinary public_id from a secure_url.
// Returns "" if the URL is not a Cloudinary URL for the given cloud, or
// if the structure doesn't match.
//
// Example:
//
//	https://res.cloudinary.com/dtytlzppv/image/upload/v1700000000/recipes/abc.jpg
//	→ "recipes/abc"
//
//	https://res.cloudinary.com/dtytlzppv/image/upload/w_300,f_auto/v1700000000/recipes/abc.jpg
//	→ "recipes/abc"
func PublicIDFromURL(rawURL, cloud string) string {
	if rawURL == "" || cloud == "" {
		return ""
	}
	u, err := url.Parse(rawURL)
	if err != nil || u.Host != "res.cloudinary.com" {
		return ""
	}
	parts := strings.Split(strings.TrimPrefix(u.Path, "/"), "/")
	// Expected shape: <cloud>/image/upload/<...>/<publicId>.<ext>
	if len(parts) < 4 || parts[0] != cloud || parts[1] != "image" || parts[2] != "upload" {
		return ""
	}
	rest := parts[3:]
	// Strip leading transform/version segments. Public IDs can contain
	// arbitrary path segments after these, so we only skip while the
	// segment matches transform-or-version shape.
	for len(rest) > 0 && (versionSegment.MatchString(rest[0]) || transformSegment.MatchString(rest[0])) {
		rest = rest[1:]
	}
	if len(rest) == 0 {
		return ""
	}
	joined := strings.Join(rest, "/")
	// Strip extension from the last segment only.
	ext := path.Ext(joined)
	if ext != "" {
		joined = strings.TrimSuffix(joined, ext)
	}
	return joined
}

// DeleteImageFromURL issues a Cloudinary destroy call for the image at
// secureURL. No-op (returns nil) if env vars aren't set, the URL isn't
// from our Cloudinary cloud, or the public_id can't be parsed.
//
// "result": "not found" responses are treated as success — the goal is
// idempotent cleanup, and an already-missing object satisfies that.
func DeleteImageFromURL(ctx context.Context, secureURL string) error {
	cloud := os.Getenv("CLOUDINARY_CLOUD_NAME")
	apiKey := os.Getenv("CLOUDINARY_API_KEY")
	secret := os.Getenv("CLOUDINARY_API_SECRET")
	if cloud == "" || apiKey == "" || secret == "" {
		return nil
	}
	publicID := PublicIDFromURL(secureURL, cloud)
	if publicID == "" {
		return nil
	}
	// Defense-in-depth: the app only ever uploads into the "recipes/" folder
	// (see the upload route). Refuse to destroy anything outside it so a crafted
	// image_url can never reach unrelated assets in the cloud.
	if !strings.HasPrefix(publicID, "recipes/") {
		return nil
	}

	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	// Cloudinary signs the sorted set of params other than api_key/signature.
	// Existing upload route uses SHA-256 (account config), match that.
	toSign := fmt.Sprintf("public_id=%s&timestamp=%s", publicID, timestamp)
	sum := sha256.Sum256([]byte(toSign + secret))
	signature := hex.EncodeToString(sum[:])

	form := url.Values{}
	form.Set("public_id", publicID)
	form.Set("timestamp", timestamp)
	form.Set("api_key", apiKey)
	form.Set("signature", signature)

	endpoint := "https://api.cloudinary.com/v1_1/" + cloud + "/image/destroy"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("build destroy request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 8 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("destroy %s: %w", publicID, err)
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("destroy %s: HTTP %d: %s", publicID, res.StatusCode, body)
	}
	var parsed struct{ Result string `json:"result"` }
	_ = json.Unmarshal(body, &parsed)
	if parsed.Result != "ok" && parsed.Result != "not found" {
		return fmt.Errorf("destroy %s: unexpected result %q", publicID, parsed.Result)
	}
	return nil
}
