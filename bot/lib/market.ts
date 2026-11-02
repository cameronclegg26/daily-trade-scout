// Quote fetch, snapshot shape, and realized-volatility rank.
// The model writes the brief. This file only loads prices and ranks them.

export const SNAPSHOT_KEY = "market:quotes:latest";

export function sessionSnapshotKey(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
  return `market:quotes:session:${safe || "unknown"}`;
}
export const VOL_WINDOW = 20;
export const ANNUALIZATION_DAYS = 252;
const FETCH_TIMEOUT_MS = 12_000;
const POOL = 4;
const USER_AGENT =
  "daily-trade-scout/0.1 (educational research; +https://github.com/cameronclegg26/daily-trade-scout)";

export type AssetClass = "stock" | "grain" | "metal" | "energy" | "crypto" | "unknown";
export type Sleeve = "sabio" | "phantom" | "none";

export type Instrument = {
  id: string;
  name: string;
  assetClass: AssetClass;
  sleeve: Sleeve;
  yahoo: string;
  coingecko?: string;
};

/** Desk universe. Sabio Trade is the prop book. Phantom is the small crypto sleeve. */
export const UNIVERSE: readonly Instrument[] = [
  { id: "SPY", name: "S&P 500 ETF", assetClass: "stock", sleeve: "sabio", yahoo: "SPY" },
  { id: "QQQ", name: "Nasdaq-100 ETF", assetClass: "stock", sleeve: "sabio", yahoo: "QQQ" },
  { id: "IWM", name: "Russell 2000 ETF", assetClass: "stock", sleeve: "sabio", yahoo: "IWM" },
  { id: "AAPL", name: "Apple", assetClass: "stock", sleeve: "sabio", yahoo: "AAPL" },
  { id: "MSFT", name: "Microsoft", assetClass: "stock", sleeve: "sabio", yahoo: "MSFT" },
  { id: "NVDA", name: "NVIDIA", assetClass: "stock", sleeve: "sabio", yahoo: "NVDA" },
  { id: "AMZN", name: "Amazon", assetClass: "stock", sleeve: "sabio", yahoo: "AMZN" },
  { id: "XOM", name: "Exxon Mobil", assetClass: "stock", sleeve: "sabio", yahoo: "XOM" },
  { id: "WHEAT", name: "CBOT wheat", assetClass: "grain", sleeve: "sabio", yahoo: "ZW=F" },
  { id: "CORN", name: "CBOT corn", assetClass: "grain", sleeve: "sabio", yahoo: "ZC=F" },
  { id: "SOY", name: "CBOT soybeans", assetClass: "grain", sleeve: "sabio", yahoo: "ZS=F" },
  { id: "COPPER", name: "COMEX copper", assetClass: "metal", sleeve: "sabio", yahoo: "HG=F" },
  { id: "WTI", name: "WTI crude", assetClass: "energy", sleeve: "sabio", yahoo: "CL=F" },
  { id: "BTC", name: "Bitcoin", assetClass: "crypto", sleeve: "phantom", yahoo: "BTC-USD", coingecko: "bitcoin" },
  { id: "SOL", name: "Solana", assetClass: "crypto", sleeve: "phantom", yahoo: "SOL-USD", coingecko: "solana" },
  {
    id: "HYPE",
    name: "Hyperliquid",
    assetClass: "crypto",
    sleeve: "phantom",
    yahoo: "HYPE32196-USD",
    coingecko: "hyperliquid",
  },
];

export type StoredQuote = {
  id: string;
  name: string;
  assetClass: AssetClass;
  sleeve: Sleeve;
  symbol: string;
  currency: string | null;
  last: number | null;
  changePercent: number | null;
  asOf: string | null;
  source: string | null;
  closes: number[];
  error: string | null;
};

export type QuoteSnapshot = {
  capturedAt: string;
  instruments: StoredQuote[];
};

export type RankedInstrument = {
  rank: number | null;
  id: string;
  name: string;
  assetClass: AssetClass;
  sleeve: Sleeve;
  symbol: string;
  last: number | null;
  changePercent: number | null;
  realizedVolAnnualized: number | null;
  realizedVolPercent: number | null;
  sessions: number;
  source: string | null;
  error: string | null;
};

type HttpResult = { ok: boolean; status: number; body: string; error: string | null };

export function knownIds(): string[] {
  return UNIVERSE.map((item) => item.id);
}

export function readSnapshot(value: unknown): QuoteSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { capturedAt?: unknown; instruments?: unknown };
  if (typeof record.capturedAt !== "string" || !Array.isArray(record.instruments)) return null;
  const instruments: StoredQuote[] = [];
  for (const item of record.instruments) {
    const quote = readQuote(item);
    if (quote) instruments.push(quote);
  }
  return { capturedAt: record.capturedAt, instruments };
}

export async function fetchQuotes(ids: string[] | undefined, now: Date): Promise<
  | { ok: true; snapshot: QuoteSnapshot }
  | { ok: false; error: string }
> {
  const selected = selectInstruments(ids);
  if (!selected.ok) return selected;
  const instruments = await mapPool(selected.instruments, POOL, (item) => fetchInstrument(item, now));
  return {
    ok: true,
    snapshot: { capturedAt: now.toISOString(), instruments },
  };
}

export function rankSnapshot(snapshot: QuoteSnapshot, window: number): {
  window: number;
  annualizationDays: number;
  method: string;
  ranked: RankedInstrument[];
} {
  const scored = snapshot.instruments.map((quote) => {
    const vol = realizedVol(quote.closes, window);
    return { quote, vol };
  });
  scored.sort((a, b) => {
    if (a.vol == null && b.vol == null) return a.quote.id.localeCompare(b.quote.id);
    if (a.vol == null) return 1;
    if (b.vol == null) return -1;
    if (b.vol !== a.vol) return b.vol - a.vol;
    return a.quote.id.localeCompare(b.quote.id);
  });
  let next = 1;
  const ranked = scored.map(({ quote, vol }) => {
    const rank = vol == null ? null : next++;
    return {
      rank,
      id: quote.id,
      name: quote.name,
      assetClass: quote.assetClass,
      sleeve: quote.sleeve,
      symbol: quote.symbol,
      last: round(quote.last, 4),
      changePercent: round(quote.changePercent, 2),
      realizedVolAnnualized: round(vol, 4),
      realizedVolPercent: vol == null ? null : round(vol * 100, 2),
      sessions: quote.closes.length,
      source: quote.source,
      error: quote.error,
    };
  });
  return {
    window,
    annualizationDays: ANNUALIZATION_DAYS,
    method: `Sample standard deviation of daily log returns over ${window} sessions, annualized with sqrt(${ANNUALIZATION_DAYS}). Null sessions are dropped. Instruments with fewer than ${window + 1} closes are unranked.`,
    ranked,
  };
}

export function publicQuotes(snapshot: QuoteSnapshot) {
  return snapshot.instruments.map((quote) => ({
    id: quote.id,
    name: quote.name,
    assetClass: quote.assetClass,
    sleeve: quote.sleeve,
    symbol: quote.symbol,
    currency: quote.currency,
    last: round(quote.last, 4),
    changePercent: round(quote.changePercent, 2),
    asOf: quote.asOf,
    source: quote.source,
    sessions: quote.closes.length,
    error: quote.error,
  }));
}

function selectInstruments(ids: string[] | undefined):
  | { ok: true; instruments: Instrument[] }
  | { ok: false; error: string } {
  if (!ids || ids.length === 0) return { ok: true, instruments: [...UNIVERSE] };
  if (ids.length > 20) return { ok: false, error: "At most 20 instruments per call." };
  const instruments: Instrument[] = [];
  const missing: string[] = [];
  for (const raw of ids) {
    const id = raw.trim().toUpperCase();
    const found = UNIVERSE.find((item) => item.id === id);
    if (!found) missing.push(id);
    else if (!instruments.some((item) => item.id === found.id)) instruments.push(found);
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Unknown instrument id: ${missing.join(", ")}. Known ids: ${knownIds().join(", ")}.`,
    };
  }
  return { ok: true, instruments };
}

async function fetchInstrument(instrument: Instrument, now: Date): Promise<StoredQuote> {
  const yahoo = await fetchYahoo(instrument, now);
  if (yahoo) return yahoo;
  if (instrument.coingecko) {
    const coin = await fetchCoinGecko(instrument, now);
    if (coin) return coin;
  }
  if (instrument.assetClass === "stock" && process.env.ALPHA_VANTAGE_API_KEY) {
    const alpha = await fetchAlphaVantage(instrument, now);
    if (alpha) return alpha;
  }
  if (instrument.assetClass === "stock" && process.env.FINNHUB_API_KEY) {
    const finnhub = await fetchFinnhub(instrument, now);
    if (finnhub) return finnhub;
  }
  return blank(instrument, `No public quote for ${instrument.id}. Yahoo failed, and no fallback returned data.`);
}

async function fetchYahoo(instrument: Instrument, now: Date): Promise<StoredQuote | null> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(instrument.yahoo)}` +
    "?interval=1d&range=6mo&includePrePost=false";
  const res = await fetchText(url);
  if (!res.ok) return null;
  let parsed: YahooChart;
  try {
    parsed = JSON.parse(res.body) as YahooChart;
  } catch {
    return null;
  }
  const row = parsed.chart?.result?.[0];
  if (!row) return null;
  const closes = (row.indicators?.quote?.[0]?.close ?? []).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  const last = finite(row.meta?.regularMarketPrice) ?? closes.at(-1) ?? null;
  const change = finite(row.meta?.regularMarketChangePercent);
  const marketTime = finite(row.meta?.regularMarketTime);
  return {
    ...identity(instrument, instrument.yahoo),
    currency: row.meta?.currency ?? "USD",
    last,
    changePercent: change,
    asOf: marketTime == null ? now.toISOString() : new Date(marketTime * 1000).toISOString(),
    source: "yahoo",
    closes,
    error: closes.length === 0 ? "Yahoo returned a price but no daily closes." : null,
  };
}

async function fetchCoinGecko(instrument: Instrument, now: Date): Promise<StoredQuote | null> {
  if (!instrument.coingecko) return null;
  const url =
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(instrument.coingecko)}` +
    "/market_chart?vs_currency=usd&days=180&interval=daily";
  const headers: Record<string, string> = {};
  const key = process.env.COINGECKO_API_KEY;
  if (key) headers["x-cg-demo-api-key"] = key;
  const res = await fetchText(url, headers);
  if (!res.ok) return null;
  let parsed: { prices?: unknown };
  try {
    parsed = JSON.parse(res.body) as { prices?: unknown };
  } catch {
    return null;
  }
  const closes: number[] = [];
  if (Array.isArray(parsed.prices)) {
    for (const point of parsed.prices) {
      if (!Array.isArray(point)) continue;
      const price = point[1];
      if (typeof price === "number" && Number.isFinite(price) && price > 0) closes.push(price);
    }
  }
  if (closes.length === 0) return null;
  const last = closes.at(-1) ?? null;
  const prev = closes.at(-2) ?? null;
  return {
    ...identity(instrument, instrument.coingecko),
    currency: "USD",
    last,
    changePercent: percentChange(last, prev),
    asOf: now.toISOString(),
    source: "coingecko",
    closes,
    error: null,
  };
}

async function fetchAlphaVantage(instrument: Instrument, now: Date): Promise<StoredQuote | null> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return null;
  const url =
    "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&outputsize=compact&symbol=" +
    `${encodeURIComponent(instrument.yahoo)}&apikey=${encodeURIComponent(key)}`;
  const res = await fetchText(url);
  if (!res.ok) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(res.body) as Record<string, unknown>;
  } catch {
    return null;
  }
  const series = parsed["Time Series (Daily)"];
  if (!series || typeof series !== "object") return null;
  const closes: number[] = [];
  for (const day of Object.keys(series).sort()) {
    const bar = (series as Record<string, unknown>)[day];
    if (!bar || typeof bar !== "object") continue;
    const close = Number((bar as Record<string, unknown>)["4. close"]);
    if (Number.isFinite(close) && close > 0) closes.push(close);
  }
  if (closes.length === 0) return null;
  const last = closes.at(-1) ?? null;
  const prev = closes.at(-2) ?? null;
  return {
    ...identity(instrument, instrument.yahoo),
    currency: "USD",
    last,
    changePercent: percentChange(last, prev),
    asOf: now.toISOString(),
    source: "alphavantage",
    closes,
    error: null,
  };
}

async function fetchFinnhub(instrument: Instrument, now: Date): Promise<StoredQuote | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const url =
    "https://finnhub.io/api/v1/quote?symbol=" +
    `${encodeURIComponent(instrument.yahoo)}&token=${encodeURIComponent(key)}`;
  const res = await fetchText(url);
  if (!res.ok) return null;
  let parsed: { c?: unknown; pc?: unknown; t?: unknown };
  try {
    parsed = JSON.parse(res.body) as { c?: unknown; pc?: unknown; t?: unknown };
  } catch {
    return null;
  }
  const last = finite(parsed.c);
  const prev = finite(parsed.pc);
  if (last == null || last <= 0) return null;
  const stamp = finite(parsed.t);
  return {
    ...identity(instrument, instrument.yahoo),
    currency: "USD",
    last,
    changePercent: percentChange(last, prev),
    asOf: stamp == null ? now.toISOString() : new Date(stamp * 1000).toISOString(),
    source: "finnhub",
    closes: [],
    error: "Finnhub returned the last price only, so realized volatility is unavailable.",
  };
}

function realizedVol(closes: number[], window: number): number | null {
  const clean = closes.filter((value) => Number.isFinite(value) && value > 0);
  if (clean.length < window + 1) return null;
  const slice = clean.slice(-(window + 1));
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1];
    const curr = slice[i];
    if (prev == null || curr == null || prev <= 0 || curr <= 0) continue;
    returns.push(Math.log(curr / prev));
  }
  if (returns.length < window) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  if (!Number.isFinite(variance) || variance < 0) return null;
  return Math.sqrt(variance) * Math.sqrt(ANNUALIZATION_DAYS);
}

function identity(instrument: Instrument, symbol: string): Pick<
  StoredQuote,
  "id" | "name" | "assetClass" | "sleeve" | "symbol"
> {
  return {
    id: instrument.id,
    name: instrument.name,
    assetClass: instrument.assetClass,
    sleeve: instrument.sleeve,
    symbol,
  };
}

function blank(instrument: Instrument, error: string): StoredQuote {
  return {
    ...identity(instrument, instrument.yahoo),
    currency: null,
    last: null,
    changePercent: null,
    asOf: null,
    source: null,
    closes: [],
    error,
  };
}

function readQuote(value: unknown): StoredQuote | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<StoredQuote>;
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  const closes = Array.isArray(row.closes)
    ? row.closes.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];
  return {
    id: row.id,
    name: row.name,
    assetClass: isAssetClass(row.assetClass) ? row.assetClass : "unknown",
    sleeve: row.sleeve === "sabio" || row.sleeve === "phantom" ? row.sleeve : "none",
    symbol: typeof row.symbol === "string" ? row.symbol : row.id,
    currency: typeof row.currency === "string" ? row.currency : null,
    last: finite(row.last),
    changePercent: finite(row.changePercent),
    asOf: typeof row.asOf === "string" ? row.asOf : null,
    source: typeof row.source === "string" ? row.source : null,
    closes,
    error: typeof row.error === "string" ? row.error : null,
  };
}

function isAssetClass(value: unknown): value is AssetClass {
  return (
    value === "stock" ||
    value === "grain" ||
    value === "metal" ||
    value === "energy" ||
    value === "crypto" ||
    value === "unknown"
  );
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "application/json,text/plain,*/*", ...headers },
    });
    const body = redact(await response.text());
    if (!response.ok) {
      return { ok: false, status: response.status, body: "", error: `HTTP ${response.status}` };
    }
    return { ok: true, status: response.status, body, error: null };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      body: "",
      error: aborted ? "timed out" : "request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

function redact(text: string): string {
  return text.replace(/([?&](?:apikey|apiKey|token)=)[^&\s]+/gi, "$1***");
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percentChange(last: number | null, prev: number | null): number | null {
  if (last == null || prev == null || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}

function round(value: number | null, digits: number): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      out[index] = await fn(item);
    }
  });
  await Promise.all(workers);
  return out;
}

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        regularMarketPrice?: number;
        regularMarketChangePercent?: number;
        regularMarketTime?: number;
      };
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }> | null;
  };
};
