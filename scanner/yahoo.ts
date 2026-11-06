// Public Yahoo v8 chart bars, including traded volume. No key. No order path.
// The v7 quote API is not used.

export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Traded volume. Null when the feed omitted it. Zero is kept and treated as missing later. */
  volume: number | null;
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
          volume?: Array<number | null>;
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
  return barsFromChart(JSON.parse(body) as YahooChart, interval);
}

/** Map a v8 chart payload to bars. Drops a trailing zero-volume stub that is not a full bar. */
export function barsFromChart(parsed: YahooChart, interval: string): Bar[] {
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
    const raw = quote.volume?.[i];
    const volume = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
    bars.push({ time: time * 1000, open, high, low, close, volume });
  }
  return dropVolumeStub(bars, intervalMs(interval));
}

export function resample4h(bars: readonly Bar[]): Bar[] {
  const groups = new Map<number, Bar>();
  for (const bar of bars) {
    const bucket = Math.floor(bar.time / (4 * 60 * 60 * 1000)) * 4 * 60 * 60 * 1000;
    const existing = groups.get(bucket);
    if (!existing) {
      groups.set(bucket, { ...bar, time: bucket });
      continue;
    }
    existing.high = Math.max(existing.high, bar.high);
    existing.low = Math.min(existing.low, bar.low);
    existing.close = bar.close;
    existing.volume = sumVolume(existing.volume, bar.volume);
  }
  return [...groups.values()].sort((a, b) => a.time - b.time);
}

function sumVolume(left: number | null, right: number | null): number | null {
  if (left == null || right == null) return null;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return left + right;
}

/** Yahoo sometimes appends the latest tick as a zero-volume bar a few minutes after the real candle. */
function dropVolumeStub(bars: Bar[], interval: number): Bar[] {
  if (bars.length < 2) return bars;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  if (!last || !prev) return bars;
  const gap = last.time - prev.time;
  const missing = last.volume == null || last.volume <= 0;
  if (missing && gap > 0 && gap < interval * 0.75) return bars.slice(0, -1);
  return bars;
}

function intervalMs(interval: string): number {
  const match = /^(\d+)(m|h|d|wk)$/.exec(interval);
  if (!match) return 60 * 60 * 1000;
  const count = Number(match[1]);
  const unit = match[2];
  if (unit === "m") return count * 60 * 1000;
  if (unit === "h") return count * 60 * 60 * 1000;
  if (unit === "d") return count * 24 * 60 * 60 * 1000;
  return count * 7 * 24 * 60 * 60 * 1000;
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
