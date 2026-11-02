// Public Yahoo chart bars. No key. No order path.

export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

const USER_AGENT = "daily-trade-scout/0.1 (educational research; alerts only)";
const TIMEOUT_MS = 12_000;

type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
        }>;
      };
    }> | null;
  };
};

export async function fetchBars(symbol: string, interval: string, range: string): Promise<Bar[]> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${interval}&range=${range}&includePrePost=false`;
  const body = await fetchText(url);
  const parsed = JSON.parse(body) as YahooChart;
  const row = parsed.chart?.result?.[0];
  if (!row?.timestamp || !row.indicators?.quote?.[0]) return [];
  const quote = row.indicators.quote[0];
  const bars: Bar[] = [];
  for (let i = 0; i < row.timestamp.length; i++) {
    const time = row.timestamp[i];
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    if (
      time == null ||
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      !(open > 0) ||
      !(high > 0) ||
      !(low > 0) ||
      !(close > 0)
    ) {
      continue;
    }
    bars.push({ time: time * 1000, open, high, low, close });
  }
  return bars;
}

export function resample4h(bars: readonly Bar[]): Bar[] {
  const groups = new Map<number, Bar>();
  for (const bar of bars) {
    const bucket = Math.floor(bar.time / (4 * 60 * 60 * 1000)) * 4 * 60 * 60 * 1000;
    const existing = groups.get(bucket);
    if (!existing) {
      groups.set(bucket, { time: bucket, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
      continue;
    }
    existing.high = Math.max(existing.high, bar.high);
    existing.low = Math.min(existing.low, bar.low);
    existing.close = bar.close;
  }
  return [...groups.values()].sort((a, b) => a.time - b.time);
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Yahoo HTTP ${response.status} for ${url.split("?")[0]}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}
