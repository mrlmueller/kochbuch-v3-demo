package ai

// USD per 1M tokens.
type Pricing struct{ InputPer1M, OutputPer1M float64 }

var Prices = map[string]Pricing{
	"claude:claude-sonnet-5": {InputPer1M: 3.00, OutputPer1M: 15.00},
	// Still registered as a nutrition estimator (see nutrition.go).
	"claude:claude-sonnet-4-6": {InputPer1M: 3.00, OutputPer1M: 15.00},
	"claude:claude-opus-4-8":   {InputPer1M: 5.00, OutputPer1M: 25.00},
	"claude:claude-haiku-4-5":  {InputPer1M: 1.00, OutputPer1M: 5.00},
	"openai:gpt-5.6-terra":     {InputPer1M: 2.50, OutputPer1M: 15.00},
	"openai:gpt-5.6-luna":      {InputPer1M: 1.00, OutputPer1M: 6.00},
}

func CostUSD(provider, model string, inTokens, outTokens int) float64 {
	p, ok := Prices[provider+":"+model]
	if !ok {
		return 0
	}
	return float64(inTokens)*p.InputPer1M/1_000_000 + float64(outTokens)*p.OutputPer1M/1_000_000
}
