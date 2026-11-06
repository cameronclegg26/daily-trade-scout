import assert from "node:assert/strict";
import test from "node:test";
import { londonClock } from "./clock.js";
import { alertable, evaluateSymbol, formatSetup, type ScanContext } from "./rules.js";
import { WATCHLIST, type Spec } from "./universe.js";
import { assessVolume } from "./volume.js";
import { barsFromChart, resample4h, type Bar } from "./yahoo.js";

const HOUR = 60 * 60 * 1000;
const FOREX = "Volume: not available (spot forex has no reliable traded volume)";
const FEED = "Volume: not available (no reliable traded volume in the feed)";
const BAR = "Volume: not available (the setup bar has no traded volume in the feed)";

function spec(id: string): Spec {
  const found = WATCHLIST.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function series(
  volumes: number[],
  opts?: { bearish?: boolean; lastOpen?: number; lastClose?: number },
): Bar[] {
  const start = Date.parse("2026-11-02T00:00:00Z");
  return volumes.map((volume, i) => {
    const close = opts?.lastClose != null && i === volumes.length - 1 ? opts.lastClose : 100 + i;
    const open =
      opts?.lastOpen != null && i === volumes.length - 1
        ? opts.lastOpen
        : opts?.bearish
          ? close + 0.5
          : close - 0.5;
    return {
      time: start + i * HOUR,
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume,
    };
  });
}

function repeat(count: number, volume: number, last: number): number[] {
  return [...Array(count - 1).fill(volume), last];
}

function closedAt(bars: Bar[]): number {
  return bars.at(-1)!.time + HOUR;
}

test("gold, crypto, and the listed stock share one backing readout", () => {
  const bars = series(repeat(24, 1000, 1800));
  const now = closedAt(bars);
  const expected = "Volume: backing the move (1.8x average)";
  for (const id of ["GOLD", "BTC", "ETH", "QQQ", "US500"]) {
    const read = assessVolume(spec(id), "long", "break", bars, now);
    assert.equal(read.line, expected, id);
    assert.equal(read.status, "backing");
    assert.equal(read.relative, 1.8);
  }
});

test("a short is backed only when the bar closes with the short", () => {
  const bars = series(repeat(24, 1000, 1800), { bearish: true });
  const read = assessVolume(spec("BTC"), "short", "retest", bars, closedAt(bars));
  assert.equal(read.line, "Volume: backing the move (1.8x average)");
});

test("light volume does not confirm", () => {
  const bars = series(repeat(24, 1000, 500));
  const read = assessVolume(spec("GOLD"), "long", "break", bars, closedAt(bars));
  assert.equal(read.line, "Volume: not confirming (light, 0.5x average)");
  assert.equal(read.status, "not_confirming");
});

test("volume that is only average does not confirm", () => {
  const bars = series(repeat(24, 1000, 1050));
  const read = assessVolume(spec("QQQ"), "long", "break", bars, closedAt(bars));
  assert.equal(read.line, "Volume: not confirming (not above average, 1.1x average)");
});

test("expanding volume backs the move even under 1.2x", () => {
  const bars = series(repeat(24, 1000, 1100));
  const read = assessVolume(spec("ETH"), "long", "break", bars, closedAt(bars));
  assert.equal(read.line, "Volume: backing the move (1.1x average, expanding)");
});

test("fading volume while price extends is divergence", () => {
  const volumes = [...Array(21).fill(1000), 3000, 2000, 1500];
  const bars = series(volumes);
  const read = assessVolume(spec("SOL"), "long", "break", bars, closedAt(bars));
  assert.equal(read.line, "Volume: not confirming (diverging, 1.3x average)");
});

test("heavy volume that closes against the trade does not back it", () => {
  const bars = series(repeat(24, 1000, 2000), { lastOpen: 130, lastClose: 120 });
  const read = assessVolume(spec("QQQ"), "long", "break", bars, closedAt(bars));
  assert.equal(read.line, "Volume: not confirming (against the move, 2.0x average)");
});

test("an open hour is scaled so a half hour is not called light", () => {
  const bars = series(repeat(24, 1000, 900));
  const now = bars.at(-1)!.time + 30 * 60 * 1000;
  const read = assessVolume(spec("GOLD"), "long", "break", bars, now);
  assert.equal(read.line, "Volume: backing the move (1.8x average)");
});

test("a young hour uses the last closed hour and says so", () => {
  const volumes = [...Array(20).fill(1000), 1800, 100];
  const bars = series(volumes);
  const now = bars.at(-1)!.time + 5 * 60 * 1000;
  const read = assessVolume(spec("BTC"), "long", "break", bars, now);
  assert.equal(read.line, "Volume: backing the move (1.8x average, last closed hour)");
});

test("a young hour that has already beaten a full average hour is used as-is", () => {
  const bars = series(repeat(24, 1000, 1500));
  const now = bars.at(-1)!.time + 5 * 60 * 1000;
  const read = assessVolume(spec("QQQ"), "long", "break", bars, now);
  assert.equal(read.line, "Volume: backing the move (1.5x average)");
});

test("an open hour with no print does not borrow another hour", () => {
  const bars = series(repeat(24, 1000, 0));
  const now = bars.at(-1)!.time + 30 * 60 * 1000;
  const read = assessVolume(spec("GOLD"), "long", "break", bars, now);
  assert.equal(read.line, BAR);
  assert.equal(read.relative, null);
});

test("spot forex never gets a made-up volume figure", () => {
  const bars = series(repeat(24, 1000, 5000));
  const now = closedAt(bars);
  for (const id of ["GBPUSD", "EURUSD", "USDJPY"]) {
    const read = assessVolume(spec(id), "long", "break", bars, now);
    assert.equal(read.line, FOREX, id);
    assert.equal(read.relative, null);
  }
});

test("all-zero volume is unavailable, and a closed session still reports its last hour", () => {
  const zeros = series(Array(24).fill(0));
  assert.equal(assessVolume(spec("BTC"), "long", "break", zeros, closedAt(zeros)).line, FEED);
  const closed = series(repeat(24, 1000, 1800));
  const later = closed.at(-1)!.time + 5 * HOUR;
  assert.equal(
    assessVolume(spec("QQQ"), "long", "break", closed, later).line,
    "Volume: backing the move (1.8x average, last closed hour)",
  );
});

test("a completed setup bar with no volume is not called light", () => {
  const bars = series(repeat(24, 1000, 0));
  const read = assessVolume(spec("QQQ"), "long", "break", bars, closedAt(bars));
  assert.equal(read.line, BAR);
});

test("high volume without a break or retest is not called backing", () => {
  const bars = series(repeat(24, 1000, 1800));
  const read = assessVolume(spec("GOLD"), "long", null, bars, closedAt(bars));
  assert.equal(read.line, "Volume: not confirming (no break or retest, 1.8x average)");
});

test("the v8 parser keeps traded volume and drops a zero-volume stub", () => {
  const start = 1_700_000_000;
  const parsed = {
    chart: {
      result: [
        {
          timestamp: [start, start + 3600, start + 3600 + 13 * 60],
          indicators: {
            quote: [
              {
                open: [10, 11, 12],
                high: [11, 12, 12],
                low: [9, 10, 12],
                close: [10.5, 11.5, 12],
                volume: [100, 250, 0],
              },
            ],
          },
        },
      ],
    },
  };
  const bars = barsFromChart(parsed, "1h");
  assert.equal(bars.length, 2);
  assert.deepEqual(
    bars.map((bar) => bar.volume),
    [100, 250],
  );
});

test("a full hour with zero volume is kept so the readout can say it is missing", () => {
  const start = 1_700_000_000;
  const parsed = {
    chart: {
      result: [
        {
          timestamp: [start, start + 3600],
          indicators: {
            quote: [
              {
                open: [10, 11],
                high: [11, 12],
                low: [9, 10],
                close: [10.5, 11.5],
                volume: [100, 0],
              },
            ],
          },
        },
      ],
    },
  };
  const bars = barsFromChart(parsed, "1h");
  assert.equal(bars.length, 2);
  assert.equal(bars[1]?.volume, 0);
});

test("4h bars sum traded volume and stay empty when an hour is missing", () => {
  const start = Date.parse("2026-11-02T00:00:00Z");
  const withVolume: Bar[] = [
    { time: start, open: 10, high: 11, low: 9, close: 10.5, volume: 100 },
    { time: start + HOUR, open: 10.5, high: 12, low: 10, close: 11.5, volume: 50 },
  ];
  const summed = resample4h(withVolume);
  assert.equal(summed.length, 1);
  assert.equal(summed[0]?.volume, 150);
  const hole: Bar[] = [{ ...withVolume[0]! }, { ...withVolume[1]!, volume: null }];
  assert.equal(resample4h(hole)[0]?.volume, null);
});

test("an A-grade stock setup keeps its grade and shows light volume on the alert", () => {
  const qqq = spec("QQQ");
  const h1 = trend(400);
  const now = new Date(h1.at(-1)!.time + HOUR);
  const plan = evaluateSymbol(qqq, trend(1000), h1, trend(1000), [], context(now));
  assert.equal(plan.long.grade, "A", plan.long.reason);
  assert.equal(plan.long.volumeLine, "Volume: not confirming (light, 0.4x average)");
  const clock = londonClock(new Date("2026-11-06T15:30:00Z"));
  assert.deepEqual(alertable(plan.long, clock), { ok: true });
  const line = formatSetup(qqq, plan.long, clock);
  assert.match(line, /A \| LONG QQQ \|/);
  assert.match(line, /Volume: not confirming \(light, 0\.4x average\)/);
  assert.doesNotMatch(line, /place live orders|broker/);
});

test("backing volume does not invent a new grade", () => {
  const qqq = spec("QQQ");
  const h1 = trend(1800);
  const now = new Date(h1.at(-1)!.time + HOUR);
  const plan = evaluateSymbol(qqq, trend(1000), h1, trend(1000), [], context(now));
  assert.equal(plan.long.grade, "A", plan.long.reason);
  assert.equal(plan.long.volumeLine, "Volume: backing the move (1.8x average)");
});

function trend(lastVolume: number): Bar[] {
  const start = Date.parse("2026-10-01T00:00:00Z");
  const out: Bar[] = [];
  for (let i = 0; i < 60; i++) {
    const close = i === 58 ? 109.8 : i === 59 ? 110.15 : 50 + i;
    out.push({
      time: start + i * HOUR,
      open: close - 0.4,
      high: close + 1,
      low: close - 1,
      close,
      volume: i === 59 ? lastVolume : 1000,
    });
  }
  return out;
}

function context(now: Date): ScanContext {
  return {
    now,
    clock: londonClock(now),
    oilChangePercent: null,
    us500ChangePercent: null,
    hotUsData: false,
    qqqEarningsMiss: false,
  };
}
