---
description: Use when writing the weekday research brief for Sabio Trade and the small Phantom crypto sleeve.
---

# Daily desk brief

Write the brief in markdown, then call `save_daily_brief` with today's UTC date and the full markdown.

Use only numbers and headlines the tools returned. If a figure is missing, write "not available".

## Shape

# Daily trade scout — YYYY-MM-DD

One short paragraph on what moved, from `fetch_quotes` only.

## Volatility rank

A table from `rank_volatility`, highest realized vol first. Columns: rank, instrument, sleeve, last, day change, 20-day realized vol percent. Say that vol is the annualized sample standard deviation of daily log returns, using a 252-day year. Leave unranked names out of the numbered list and mention them underneath if their session count was too short.

## Sabio Trade

This is the main prop account. Most of the brief lives here. Cover stocks, wheat, corn, soybeans, and copper. Mention WTI only as oil context. At most three research ideas. Each idea names the instrument, its vol rank, and one headline that supports the observation. End each idea with "research, not an order".

## Phantom sleeve

BTC, SOL, and HYPE only. Keep this section shorter than Sabio Trade. No other crypto. The sleeve is a research label for a small book a person might hold in Phantom. Do not ask for a seed phrase, a signature, or a destination address.

## Oil and geopolitics

One subsection for each outlet: Reuters, Al Jazeera, Arab News, CNBC Oil, OPEC, EIA, IEA. Quote the title and the link the tool returned. If the outlet failed or had no matching item, say that in one sentence. Do not invent a headline or a source.

## Headlines

Five market headlines from `fetch_headlines`, each with its source name.

## Research only

State that this agent does not place live orders, has no broker connection, and does not sign or send wallet transactions.
