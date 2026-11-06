# daily-trade-scout

Weekday market-research desk built with `@grok/agent-sdk` 0.5.0.

It fetches public quotes, ranks them by realized volatility, collects market headlines, and collects oil and geopolitics items from Reuters, Al Jazeera, Arab News, CNBC Oil, OPEC, EIA, and IEA. It saves a dated markdown brief in `briefs/`.

The brief is framed for **Sabio Trade** (the main prop account, where most of the note belongs) and a **small Phantom-wallet crypto sleeve** for BTC, SOL, and HYPE. Phantom and Sabio Trade are labels for the reader. This project does not connect to either one.

**This agent does not place live orders.** It has no broker client, no exchange client, and no wallet execution code. It does not sign transactions or send them. Every saved brief says the same thing. Use it for education and research only.

To see the watchlist in a browser on this PC, start Scout Desk with `npm run desk`. It is a local page. It does not place orders.

## What it watches

| Id | Market | Sleeve |
| --- | --- | --- |
| SPY, QQQ, IWM, AAPL, MSFT, NVDA, AMZN, XOM | Stocks and index ETFs | Sabio Trade |
| WHEAT (`ZW=F`), CORN (`ZC=F`), SOY (`ZS=F`) | CBOT grains | Sabio Trade |
| COPPER (`HG=F`) | COMEX copper | Sabio Trade |
| WTI (`CL=F`) | NYMEX crude, oil context | Sabio Trade |
| BTC, SOL, HYPE | Crypto | Phantom sleeve |

HYPE uses the Yahoo symbol `HYPE32196-USD`. If that chart is missing, the tool falls back to the CoinGecko `hyperliquid` series.

The strategy watchlist is also in the quote tool: GOLD (`GC=F`), US500 (`ES=F`), US30 (`YM=F`), QQQ, SQQQ, TQQQ, GBPUSD, EURUSD, USDJPY, WTI, BTC, ETH, SOL, and ZEC. Sabio cannot trade NAS100. Use US500, US30, QQQ, SQQQ, or TQQQ instead.

## Strategy scanner

`scanner/` is a rules check with no model and no tokens. It does not place orders. There is no broker client and no wallet client in this script.

It pulls Yahoo v8 chart prices (the v7 quote API is not used), checks that the daily, 4h, and 1h trends agree, looks for a break or retest of the previous day's high or low, the Asia and London session highs and lows, and round numbers, then applies the risk and UK timing rules in `bot/skills/daily-desk.md`. An A or A+ setup appends one line to `alerts/YYYY-MM-DD.md` (Europe/London date) and prints that line. The line includes the other side as a paired setup. A B grade by itself is not written.

Each of those lines has a volume check before the reason, so you can see whether volume is backing the move before you enter. The grade stays A or A+. Volume does not add a new grade and it does not turn an A into a B.

The figure is the setup hour compared with the previous 20 hours that actually traded. `1.8x average` means that hour was 1.8 times a normal hour. A still-open hour that is at least 15 minutes old is scaled to a full hour, so a half-finished hour is not called quiet just because it has not ended. Under 15 minutes, the line uses the last closed hour and says so, unless this hour has already traded at least 1.2 times a normal full hour.

Volume **backs the move** on a break or retest when that hour is at least 1.2x the recent average, or it is expanding (at least 10% busier than the previous hour and the previous three hours), and volume is not fading. The line reads `Volume: backing the move (1.8x average)`.

Volume is **not confirming** when the hour is below that average (`light` or `not above average`), when the bar closed against the trade (`against the move`), or when price has pushed further over the last four hours while volume fell on each of the last three (`diverging`). Example: `Volume: not confirming (light, 0.6x average)`.

Gold (`GC=F`), crypto (BTC, ETH, SOL, ZEC), the listed ETF QQQ, index futures, and oil use this when the v8 chart has traded volume. The same rule applies to any other non-forex name the scanner covers. Spot forex (GBP/USD, EUR/USD, USD/JPY) does not: Yahoo's volume for those pairs is zeros, not traded volume, so the line is `Volume: not available (spot forex has no reliable traded volume)`. A missing or empty print is also "not available". When the setup hour has already closed, including a stock before the cash session opens, the figure is that last hour and the line says `last closed hour`. The scanner never fills in a made-up number.

A brief that lists a setup copies this line from today's alert. If the alert has no volume figure, the brief says volume is not available.

```bash
npm run scan          # one pass
npm run scan:loop     # repeat every 15 minutes
```

`NTFY_TOPIC` in `.env` sends that same line to `https://ntfy.sh/<topic>`. Leave it empty and push stays off. The topic is 1–64 letters, digits, `_`, or `-`.

Two optional switches stay off unless you set them to `1`: `SCAN_HOT_US_DATA` blocks gold after 13:00 UK, and `SCAN_QQQ_EARNINGS_MISS` blocks a QQQ long until the 1h chart makes a higher low. The scanner cannot see headlines, earnings, midterms, or Iran nights by itself. The brief applies those from the news tools.

Paper results live in `scanner/state.json` (not committed). Two losses or -$400 stops new alerts for the London day. Open risk is capped at $600. A stop is never widened. See `alerts/README.md`.

## Scout Desk

Scout Desk is a local watchlist you open in a browser on the same PC as the scanner. The page is dark, with amber labels, white prices, green for up, and red for down. It is research only. It does not place orders, it has no broker fields, and it does not ask for an exchange key.

```bash
npm run desk
```

The command prints `http://127.0.0.1:3847` and tries to open it. The server listens on `127.0.0.1` only, so it is not reachable from another computer. Set `DESK_PORT` to use another port. Set `DESK_NO_OPEN=1` when you would rather paste the address yourself (this is the right switch on Windows if the browser does not open).

The board lists every name in `scanner/universe.ts`. Add a symbol there and the next refresh shows it. Prices, the 1-hour chart, and the volume line come from the same Yahoo v8 chart feed as `npm run scan`. The volume words are the scanner's own check (`backing the move`, `not confirming` with the relative-volume multiple, or `not available`). Spot forex stays `not available`. The desk does not fill in a figure.

Today's A and A+ lines are read from `alerts/YYYY-MM-DD.md` (Europe/London). The page shows the entry, stop, half / 1R, 2R, trigger, and volume line from that file, and labels them as an alert / research plan. Run `npm run scan` to write the file. The desk reloads about once a minute. If there is no A or A+ line today, the page says so.

Volatility is the sample standard deviation of daily log returns over 20 sessions, annualized with `sqrt(252)`. Names with too little history stay unranked.

## Setup

Requires Node.js 22.13 or newer. Do not use Bun.

```bash
npm install
cp .env.example .env   # optional; public sources work with the keys empty
```

API keys are optional. Leave them blank to use Yahoo Finance charts and public RSS.

| Variable | Used when |
| --- | --- |
| `FINNHUB_API_KEY` | Yahoo fails for a stock. Last price only, so that name is not ranked. |
| `ALPHA_VANTAGE_API_KEY` | Yahoo fails for a stock. Daily history, so the rank can include it. |
| `COINGECKO_API_KEY` | Optional demo key for the BTC, SOL, and HYPE fallback. The public endpoint works without it. |
| `NEWSAPI_KEY` | Optional extra business headlines. |

On Cursor hosting, set those names with `npx agent-sdk secret set` and pipe the value on stdin. Do not put secrets in argv.

## Check

```bash
npx agent-sdk validate --dir .
npx tsc --noEmit -p .
npx agent-sdk info --dir . --json
```

Call one tool with no model turn:

```bash
npx agent-sdk tool call fetch_quotes --dir . --input '{}' --json
npx agent-sdk tool call rank_volatility --dir . --input '{}' --json
```

## Run

A model turn needs a Cursor credential (`CURSOR_API_KEY`, or `npx agent-sdk login`).

```bash
npx agent-sdk dev
```

Open the playground URL the command prints. Ask it to run the desk and save today's brief.

One shot, without the playground:

```bash
npx agent-sdk run --dir . --message "Run the weekday research desk and save today's brief. Do not place orders."
```

The weekday schedule is `bot/schedules/weekday-open.md`: `0 7 * * 1-5`, which is 07:00 UTC Monday through Friday. `agent-sdk dev` does not fire schedules. Dispatch it by hand. The HTTP slug is the directory name (`npx agent-sdk info --dir .` prints `slug`). A checkout named `daily-trade-scout` uses:

```bash
curl -X POST http://127.0.0.1:3000/daily-trade-scout/v1/dev/schedules/weekday-open
```

The smoke eval is `evals/smoke.eval.ts`. It needs a Cursor credential:

```bash
npx agent-sdk eval --dir . --tag smoke
```

## Briefs

`save_daily_brief` writes `briefs/YYYY-MM-DD.md`, stores the same markdown in the agent file store, and tags a `daily-brief` artifact. A second run on the same UTC date overwrites that file. See `briefs/README.md`.

## Sources

Quotes come from Yahoo Finance chart data. Crypto can fall back to CoinGecko. Stocks can fall back to Alpha Vantage or Finnhub when those keys are set.

Headlines come from the Yahoo Finance RSS and Google News RSS.

Oil and geopolitics outlets:

- Reuters and OPEC and IEA are read through Google News headlines that cite those sites. Direct Reuters RSS is unpublished, and the OPEC and IEA sites block this agent's direct fetch.
- Al Jazeera, Arab News, CNBC Oil, and EIA are read from their public RSS feeds. Al Jazeera and Arab News are filtered to oil and geopolitics titles.

## Deploy

Do this from your own terminal so the alias token is not captured in a log.

```bash
npx agent-sdk validate --dir .
npx agent-sdk deploy --dir . --dry-run
npx agent-sdk deploy --dir .
```

Hosting egress and the optional secret names are declared in `bot/agent.ts`.
