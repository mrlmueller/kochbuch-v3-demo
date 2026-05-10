package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

func init() {
	Register("claude:claude-sonnet-4-6", func() (Extractor, error) { return newClaude("claude-sonnet-4-6"), nil })
	Register("claude:claude-haiku-4-5", func() (Extractor, error) { return newClaude("claude-haiku-4-5"), nil })
}

type claudeExtractor struct {
	model  string
	client *anthropic.Client
}

func newClaude(model string) Extractor {
	key := os.Getenv("ANTHROPIC_API_KEY")
	if key == "" {
		return &claudeExtractor{model: model}
	}
	c := anthropic.NewClient(option.WithAPIKey(key))
	return &claudeExtractor{model: model, client: &c}
}

func (e *claudeExtractor) Provider() string { return "claude" }
func (e *claudeExtractor) Model() string    { return e.model }

func (e *claudeExtractor) Extract(ctx context.Context, req Request) (Result, error) {
	if e.client == nil {
		return Result{}, fmt.Errorf("ANTHROPIC_API_KEY not set")
	}

	content := []anthropic.ContentBlockParamUnion{
		anthropic.NewTextBlock(PromptTemplate(req.Categories)),
	}
	for _, u := range req.ImageURLs {
		content = append(content, anthropic.NewImageBlock(anthropic.URLImageSourceParam{URL: u}))
	}

	schema := RecipeSchema(req.Categories)

	tool := anthropic.ToolParam{
		Name:        "save_recipe",
		Description: anthropic.String("Speichert das extrahierte Rezept."),
		InputSchema: anthropic.ToolInputSchemaParam{
			Properties: schema["properties"],
			Required:   toStringSlice(schema["required"]),
		},
	}
	tools := []anthropic.ToolUnionParam{{OfTool: &tool}}
	toolChoice := anthropic.ToolChoiceUnionParam{
		OfTool: &anthropic.ToolChoiceToolParam{Name: "save_recipe"},
	}

	msg, err := e.client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(e.model),
		MaxTokens: 2048,
		Messages: []anthropic.MessageParam{{
			Role:    anthropic.MessageParamRoleUser,
			Content: content,
		}},
		Tools:      tools,
		ToolChoice: toolChoice,
	})
	if err != nil {
		return Result{}, err
	}

	var raw json.RawMessage
	for _, block := range msg.Content {
		if tu, ok := block.AsAny().(anthropic.ToolUseBlock); ok && tu.Name == "save_recipe" {
			raw = json.RawMessage(tu.JSON.Input.Raw())
			break
		}
	}
	if len(raw) == 0 {
		return Result{}, fmt.Errorf("model did not call save_recipe tool")
	}

	var out Result
	if err := json.Unmarshal(raw, &out); err != nil {
		return Result{}, fmt.Errorf("decode tool input: %w", err)
	}
	out.InputTokens = int(msg.Usage.InputTokens)
	out.OutputTokens = int(msg.Usage.OutputTokens)
	return out, nil
}

func toStringSlice(v any) []string {
	if v == nil {
		return nil
	}
	if s, ok := v.([]string); ok {
		return s
	}
	if a, ok := v.([]any); ok {
		out := make([]string, 0, len(a))
		for _, x := range a {
			if s, ok := x.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}
