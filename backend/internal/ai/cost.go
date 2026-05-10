package ai

// USD per 1M tokens.
type Pricing struct{ InputPer1M, OutputPer1M float64 }

var Prices = map[string]Pricing{
	"claude:claude-sonnet-4-6": {InputPer1M: 3.00, OutputPer1M: 15.00},
	"claude:claude-haiku-4-5":  {InputPer1M: 1.00, OutputPer1M: 5.00},
	"openai:gpt-5.4-mini":      {InputPer1M: 0.75, OutputPer1M: 4.50},
	"openai:gpt-5.4-nano":      {InputPer1M: 0.20, OutputPer1M: 1.25},
}

func CostUSD(provider, model string, inTokens, outTokens int) float64 {
	p, ok := Prices[provider+":"+model]
	if !ok {
		return 0
	}
	return float64(inTokens)*p.InputPer1M/1_000_000 + float64(outTokens)*p.OutputPer1M/1_000_000
}
