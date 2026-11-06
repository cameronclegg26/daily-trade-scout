---
description: Use when writing the weekday research brief or grading a trade idea for Sabio Trade and the Phantom crypto sleeve.
---

# Daily desk brief

Write the brief in markdown, then call `save_daily_brief` with today's UTC date and the full markdown.

Use only numbers and headlines the tools returned. If a figure is missing, write "not available". These rules grade ideas. They do not send orders.

## Shape

# Daily trade scout — YYYY-MM-DD

One short paragraph on what moved, from `fetch_quotes` only.

## Volatility rank

A table from `rank_volatility`, highest realized vol first. Columns: rank, instrument, sleeve, last, day change, 20-day realized vol percent. Say that vol is the annualized sample standard deviation of daily log returns, using a 252-day year. Leave unranked names out of the numbered list and mention them underneath if their session count was too short.

## Sabio Trade

This is the main prop account. Most of the brief lives here. The Sabio account cannot trade NAS100. When the Nasdaq is the subject, use US500, US30, QQQ, SQQQ, or TQQQ.

Strategy watchlist: gold, US500, US30, QQQ, GBP/USD, EUR/USD, USD/JPY, oil, BTC, ETH, SOL, ZEC. Quote ids: GOLD, US500, US30, QQQ, GBPUSD, EURUSD, USDJPY, WTI, BTC, ETH, SOL, ZEC.

Grade every idea A+, A, or B. Give both a long setup and a short setup for each market you write up. End each idea with "research, not an order".

## Phantom sleeve

BTC, ETH, SOL, and ZEC only. Keep this section shorter than Sabio Trade. The sleeve is a research label. Do not ask for a seed phrase, a signature, or a destination address.

## Strategy rules

Apply every rule below. The scanner in `scanner/` alerts only on A or A+. The brief still shows B ideas and says they are not alerts.

1. A-grade only. Daily, 4h, and 1h trends agree: higher highs and higher lows, or price above the 20 and 50 moving averages (the mirror for shorts). A+ means both the structure and the averages agree on all three timeframes. A means the three timeframes agree by one of those tests. Anything else is B. Alert only A or better.
2. Levels. Use the previous day's high and low, the Asia session high and low (00:00–08:00 UK), the London session high and low (08:00–16:30 UK), and round numbers.
3. Entry. A break or a retest of a key level in the trend direction. Do not chase more than about 0.3R past the trigger. Always give both a long and a short setup.
4. Stop. Place it past the level that proves the trade wrong. Never widen it.
5. Target. At least 2R. Take half at 1R or the nearest level, then move the stop to entry.
6. Size. Risk $200. Size = $200 / stop distance. Gold: 10oz earns $10 per $1. FX: about $10 a pip per lot. USD/JPY: about $6.33 a pip per lot. For other markets state the stop distance and the $200 risk, and say the contract multiplier is not fixed by these rules.
7. Risk. $600 maximum open risk. Stop for the day after 2 losses or -$400. No new trades after that limit. No direction flip on the same market in a day.
8. Timing, UK. US open is 14:30. US data is 13:30. ISM is 15:00. No entries 15 minutes either side of big data. Wait 15–30 minutes after the open. Close before weekends. Do not hold a big position through midterms or an Iran headline night.
9. Events. No gold trades in the session after hot US data. After a megacap earnings miss, no NAS or QQQ long until New York makes a higher low. Do not hold a stock into its own earnings. On a risk-off day with oil up more than 1.5%, use index shorts or JPY/CHF longs, not gold longs. No long into a fresh one-year low on the first test. Wait for a 1h reclaim.
10. Watchlist. The list in Sabio Trade and Phantom sleeve above. Do not invent a NAS100 ticket.
11. Log. If `alerts/` or `scanner/state.json` is in the workspace, read today's file and record each idea's win or loss. Then write one daily lesson. If the log is absent, say so, and still write one lesson from the research.
12. Volume, before he would enter. On every long and every short, add one volume line. This does not change the A+, A, or B grade. Copy the scanner's volume clause from today's `alerts/` file when that symbol has one. If it does not, write `Volume: not available` and do not invent a multiple. Spot forex (GBP/USD, EUR/USD, USD/JPY) is always `Volume: not available (spot forex has no reliable traded volume)`. Gold, crypto, and listed stocks such as QQQ use the same plain-language line: `Volume: backing the move (1.8x average)` when the break or retest is at least 1.2x the recent 20 traded hours or volume is expanding, and `Volume: not confirming (light / diverging)` when it is not. A light-volume A is still an A. Say so, so it is not treated as a stronger setup.

## Oil and geopolitics

One subsection for each outlet: Reuters, Al Jazeera, Arab News, CNBC Oil, OPEC, EIA, IEA. Quote the title and the link the tool returned. If the outlet failed or had no matching item, say that in one sentence. Do not invent a headline or a source. Use this section for the hot-data, Iran, and risk-off rules.

## Headlines

Five market headlines from `fetch_headlines`, each with its source name.

## Lesson

One sentence. State the result if a logged idea closed. Otherwise state what the desk will not do tomorrow.

## Research only

State that this agent does not place live orders, has no broker connection, and does not sign or send wallet transactions.
