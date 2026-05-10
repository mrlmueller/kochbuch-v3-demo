package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

func init() {
	Register("openai:gpt-5.4-mini", func() (Extractor, error) { return newOpenAI("gpt-5.4-mini"), nil })
	Register("openai:gpt-5.4-nano", func() (Extractor, error) { return newOpenAI("gpt-5.4-nano"), nil })
}

type openaiExtractor struct {
	model  string
	client *openai.Client
}

func newOpenAI(model string) Extractor {
	key := os.Getenv("OPENAI_API_KEY")
	if key == "" {
		return &openaiExtractor{model: model}
	}
	c := openai.NewClient(option.WithAPIKey(key))
	return &openaiExtractor{model: model, client: &c}
}

func (e *openaiExtractor) Provider() string { return "openai" }
func (e *openaiExtractor) Model() string    { return e.model }

func (e *openaiExtractor) Extract(ctx context.Context, req Request) (Result, error) {
	if e.client == nil {
		return Result{}, fmt.Errorf("OPENAI_API_KEY not set")
	}

	parts := []openai.ChatCompletionContentPartUnionParam{
		{OfText: &openai.ChatCompletionContentPartTextParam{Text: Prompt(req.Categories)}},
	}
	for _, u := range req.ImageURLs {
		parts = append(parts, openai.ChatCompletionContentPartUnionParam{
			OfImageURL: &openai.ChatCompletionContentPartImageParam{
				ImageURL: openai.ChatCompletionContentPartImageImageURLParam{URL: u},
			},
		})
	}
	userMsg := openai.ChatCompletionMessageParamUnion{
		OfUser: &openai.ChatCompletionUserMessageParam{
			Content: openai.ChatCompletionUserMessageParamContentUnion{
				OfArrayOfContentParts: parts,
			},
		},
	}

	schema := RecipeSchema(req.Categories)
	schemaParam := openai.ResponseFormatJSONSchemaJSONSchemaParam{
		Name:        "recipe",
		Description: openai.String("Strukturiertes deutsches Rezept"),
		Schema:      schema,
		Strict:      openai.Bool(true),
	}

	chat, err := e.client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Model:    openai.ChatModel(e.model),
		Messages: []openai.ChatCompletionMessageParamUnion{userMsg},
		ResponseFormat: openai.ChatCompletionNewParamsResponseFormatUnion{
			OfJSONSchema: &openai.ResponseFormatJSONSchemaParam{JSONSchema: schemaParam},
		},
	})
	if err != nil {
		return Result{}, err
	}
	if len(chat.Choices) == 0 {
		return Result{}, fmt.Errorf("no choices in response")
	}

	var out Result
	if err := json.Unmarshal([]byte(chat.Choices[0].Message.Content), &out); err != nil {
		return Result{}, fmt.Errorf("decode response content: %w", err)
	}
	out.InputTokens = int(chat.Usage.PromptTokens)
	out.OutputTokens = int(chat.Usage.CompletionTokens)
	return out, nil
}
