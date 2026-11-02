---
cron: "0 7 * * 1-5"
---

Run the weekday research desk for today's UTC date. This is research only. Do not place an order.

1. Call `fetch_quotes` with no ids so the full universe is loaded.
2. Call `rank_volatility`.
3. Call `fetch_headlines`.
4. Call `fetch_oil_geopolitics`.
5. Follow the `daily-desk` skill and write the brief from those tool results.
6. Call `save_daily_brief` with the UTC date and the full markdown.

Frame most of the brief for the Sabio Trade prop account. Keep BTC, SOL, and HYPE in a short Phantom-wallet sleeve. End by stating that no live order was placed.
