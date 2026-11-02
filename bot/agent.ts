import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  name: "daily-trade-scout",
  description: "Weekday market-research desk for Sabio Trade and a small Phantom crypto sleeve. Educational only. Never places orders.",
  model: {
    id: "grok-4.7",
    params: [
      { id: "reasoning_effort", value: "high" },
      { id: "fast", value: "true" },
    ],
  },
  // No shell and no file edits. Quotes, headlines, and the brief go through authored tools.
  tools: ["read", "grep", "glob", "ls"],
  hosting: {
    egressDomains: [
      "query1.finance.yahoo.com",
      "feeds.finance.yahoo.com",
      "api.coingecko.com",
      "news.google.com",
      "www.aljazeera.com",
      "www.arabnews.com",
      "search.cnbc.com",
      "www.cnbc.com",
      "www.eia.gov",
      "www.iea.org",
      "www.opec.org",
      "www.reuters.com",
      "www.alphavantage.co",
      "finnhub.io",
      "newsapi.org",
    ],
    secretNames: ["FINNHUB_API_KEY", "ALPHA_VANTAGE_API_KEY", "COINGECKO_API_KEY", "NEWSAPI_KEY"],
  },
});
