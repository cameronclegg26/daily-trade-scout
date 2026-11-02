// Deterministic A / A+ / B grades. No model calls.

import { londonClock, londonDate, timingBlock, type LondonClock } from "./clock.js";
import type { Bar } from "./yahoo.js";
import { formatPrice, sizeText, type Spec } from "./universe.js";

export type Side = "long" | "short";
export type Grade = "A+" | "A" | "B";

export type Setup = {
  symbol: string;
  side: Side;
  grade: Grade;
  entry: number;
  stop: number | null;
  r: number | null;
  half: number | null;
  target: number | null;
  level: string | null;
  trigger: string | null;
  size: string;
  reason: string;
};

export type SymbolPlan = {
  symbol: string;
  price: number | null;
  error: string | null;
  long: Setup;
  short: Setup;
};

export type ScanContext = {
  now: Date;
  clock: LondonClock;
  oilChangePercent: number | null;
  us500ChangePercent: number | null;
  hotUsData: boolean;
  qqqEarningsMiss: boolean;
};

type Dir = "up" | "down" | "flat";

type Frame = { dir: Dir; ma: boolean; structure: boolean };

export function dayChangePercent(daily: readonly Bar[]): number | null {
  if (daily.length < 2) return null;
  const previous = daily[daily.length - 2];
  const latest = daily[daily.length - 1];
  if (!previous || !latest || previous.close === 0) return null;
  return ((latest.close - previous.close) / previous.close) * 100;
}

export function evaluateSymbol(
  spec: Spec,
  daily: readonly Bar[],
  h1: readonly Bar[],
  h4: readonly Bar[],
  m15: readonly Bar[],
  ctx: ScanContext,
): SymbolPlan {
  const price = h1.at(-1)?.close ?? daily.at(-1)?.close ?? null;
  if (price == null) {
    const blank = emptySetup(spec, "long", "no price");
    return { symbol: spec.id, price: null, error: "no price", long: blank, short: emptySetup(spec, "short", "no price") };
  }
  const frames = {
    daily: frameTrend(daily),
    h4: frameTrend(h4),
    h1: frameTrend(h1),
  };
  const levels = buildLevels(spec, daily, m15, ctx.clock, price);
  const yearLow = priorYearLow(daily, ctx.clock.date);
  const todayLow = todayExtreme(m15, ctx.clock.date, "low");
  const freshYearLow = yearLow != null && todayLow != null && todayLow <= yearLow;
  const reclaimed = yearLow != null && (h1.slice(0, -1).at(-1)?.close ?? 0) > yearLow;
  const riskOff =
    ctx.oilChangePercent != null &&
    ctx.us500ChangePercent != null &&
    ctx.oilChangePercent > 1.5 &&
    ctx.us500ChangePercent < 0;

  const long = gradeSide(spec, "long", price, frames, levels, h1);
  const short = gradeSide(spec, "short", price, frames, levels, h1);
  applyEventRules(spec, long, short, {
    freshYearLow,
    reclaimed,
    riskOff,
    hotUsData: ctx.hotUsData,
    qqqEarningsMiss: ctx.qqqEarningsMiss,
    h1Up: frames.h1.structure && frames.h1.dir === "up",
    clock: ctx.clock,
  });
  return { symbol: spec.id, price, error: null, long, short };
}

export function alertable(setup: Setup, clock: LondonClock): { ok: true } | { ok: false; reason: string } {
  if (setup.grade === "B") return { ok: false, reason: setup.reason };
  const timing = timingBlock(clock);
  if (timing) return { ok: false, reason: timing };
  return { ok: true };
}

function gradeSide(
  spec: Spec,
  side: Side,
  price: number,
  frames: { daily: Frame; h4: Frame; h1: Frame },
  levels: Level[],
  h1: readonly Bar[],
): Setup {
  const wanted: Dir = side === "long" ? "up" : "down";
  const aligned = [frames.daily, frames.h4, frames.h1].every((frame) => frame.dir === wanted);
  if (!aligned) {
    return {
      ...emptySetup(spec, side, "daily, 4h, and 1h do not agree"),
      entry: price,
    };
  }
  const strong = [frames.daily, frames.h4, frames.h1].every((frame) => frame.ma && frame.structure);
  const trigger = findTrigger(spec, side, price, levels, h1);
  if (!trigger) {
    return { ...emptySetup(spec, side, "no break or retest of a key level"), entry: price, grade: "B" };
  }
  if (trigger.chase) {
    return numbered(spec, side, price, trigger, levels, "chase is more than 0.3R past the level", "B");
  }
  return numbered(
    spec,
    side,
    price,
    trigger,
    levels,
    strong ? "D/4H/1H agree on structure and the 20/50 averages" : "D/4H/1H agree",
    strong ? "A+" : "A",
  );
}

function applyEventRules(
  spec: Spec,
  long: Setup,
  short: Setup,
  flags: {
    freshYearLow: boolean;
    reclaimed: boolean;
    riskOff: boolean;
    hotUsData: boolean;
    qqqEarningsMiss: boolean;
    h1Up: boolean;
    clock: LondonClock;
  },
): void {
  if (flags.freshYearLow && !flags.reclaimed && long.grade !== "B") {
    downgrade(long, "fresh one-year low, wait for a 1h reclaim");
  }
  if (spec.id === "GOLD" && flags.riskOff && long.grade !== "B") {
    downgrade(long, "risk-off day and oil is up more than 1.5%, no gold long");
  }
  if (spec.id === "GOLD" && flags.hotUsData && flags.clock.hour >= 13 && flags.clock.hour < 22) {
    downgrade(long, "hot US data flag is set, no gold this session");
    downgrade(short, "hot US data flag is set, no gold this session");
  }
  if (spec.id === "QQQ" && flags.qqqEarningsMiss && !flags.h1Up && long.grade !== "B") {
    downgrade(long, "QQQ earnings-miss flag is set, wait for a 1h higher low");
  }
}

type Level = { name: string; price: number };

type Trigger = {
  level: Level;
  kind: "break" | "retest";
  stop: number;
  r: number;
  chase: boolean;
};

function findTrigger(
  spec: Spec,
  side: Side,
  price: number,
  levels: Level[],
  h1: readonly Bar[],
): Trigger | null {
  const atr = averageTrueRange(h1, 14) ?? price * 0.002;
  const pad = Math.max(atr * 0.25, spec.round * 0.05, price * 0.0005);
  let best: Trigger | null = null;
  for (const level of levels) {
    const stop = side === "long" ? level.price - pad : level.price + pad;
    const r = side === "long" ? price - stop : stop - price;
    if (!(r > 0)) continue;
    const kind = triggerKind(side, price, level.price, h1);
    if (!kind) continue;
    const extension = side === "long" ? price - level.price : level.price - price;
    const chase = extension > 0.3 * r;
    const candidate: Trigger = { level, kind, stop, r, chase };
    if (!best || (!candidate.chase && best.chase) || (candidate.chase === best.chase && candidate.r < best.r)) {
      best = candidate;
    }
  }
  return best;
}

function triggerKind(side: Side, price: number, level: number, h1: readonly Bar[]): "break" | "retest" | null {
  const recent = h1.slice(-8);
  const previous = recent.at(-2)?.close;
  const last = recent.at(-1);
  if (!last || previous == null) return null;
  const broke =
    side === "long" ? previous <= level && last.close > level : previous >= level && last.close < level;
  if (broke) return "break";
  const held = side === "long" ? last.close > level : last.close < level;
  const tagged = side === "long" ? last.low <= level + Math.abs(level) * 0.001 : last.high >= level - Math.abs(level) * 0.001;
  const wasThrough = recent.some((bar) => (side === "long" ? bar.close > level : bar.close < level));
  if (held && tagged && wasThrough) return "retest";
  return null;
}

function numbered(
  spec: Spec,
  side: Side,
  entry: number,
  trigger: Trigger,
  levels: Level[],
  reason: string,
  grade: Grade,
): Setup {
  const oneR = side === "long" ? entry + trigger.r : entry - trigger.r;
  const half = nearerHalf(side, entry, trigger.r, levels, trigger.level.price, oneR);
  const target = side === "long" ? entry + 2 * trigger.r : entry - 2 * trigger.r;
  return {
    symbol: spec.id,
    side,
    grade,
    entry,
    stop: trigger.stop,
    r: trigger.r,
    half,
    target,
    level: `${trigger.level.name} ${formatPrice(spec, trigger.level.price)}`,
    trigger: trigger.kind,
    size: sizeText(spec, Math.abs(entry - trigger.stop)),
    reason,
  };
}

function nearerHalf(side: Side, entry: number, r: number, levels: Level[], used: number, oneR: number): number {
  const twoR = side === "long" ? entry + 2 * r : entry - 2 * r;
  const candidates = levels
    .map((level) => level.price)
    .filter((price) => Math.abs(price - used) > Math.max(Math.abs(used) * 1e-8, 1e-8))
    .filter((price) => (side === "long" ? price > entry && price <= twoR : price < entry && price >= twoR));
  candidates.sort((a, b) => Math.abs(a - entry) - Math.abs(b - entry));
  const nearest = candidates[0];
  if (nearest == null) return oneR;
  return Math.abs(nearest - entry) < Math.abs(oneR - entry) ? nearest : oneR;
}

function buildLevels(spec: Spec, daily: readonly Bar[], m15: readonly Bar[], clock: LondonClock, price: number): Level[] {
  const levels: Level[] = [];
  const previous = [...daily].reverse().find((bar) => londonDate(bar.time) < clock.date);
  if (previous) {
    levels.push({ name: "PDH", price: previous.high }, { name: "PDL", price: previous.low });
  }
  const asia = sessionExtreme(m15, clock.date, 0, 8 * 60);
  if (asia) {
    levels.push({ name: "Asia high", price: asia.high }, { name: "Asia low", price: asia.low });
  }
  const london = sessionExtreme(m15, clock.date, 8 * 60, 16 * 60 + 30);
  if (london) {
    levels.push({ name: "London high", price: london.high }, { name: "London low", price: london.low });
  }
  const base = Math.round(price / spec.round) * spec.round;
  for (const step of [-2, -1, 0, 1, 2]) {
    const round = base + step * spec.round;
    if (round > 0) levels.push({ name: "round", price: round });
  }
  return dedupeLevels(levels);
}

function sessionExtreme(
  bars: readonly Bar[],
  date: string,
  startMin: number,
  endMin: number,
): { high: number; low: number } | null {
  const inside = bars.filter((bar) => {
    const clock = londonClock(new Date(bar.time));
    if (clock.date !== date) return false;
    const mins = clock.hour * 60 + clock.minute;
    return mins >= startMin && mins < endMin;
  });
  if (inside.length === 0) return null;
  return {
    high: Math.max(...inside.map((bar) => bar.high)),
    low: Math.min(...inside.map((bar) => bar.low)),
  };
}

function priorYearLow(daily: readonly Bar[], today: string): number | null {
  const cutoff = Date.parse(`${today}T00:00:00Z`) - 370 * 24 * 60 * 60 * 1000;
  const window = daily.filter((bar) => bar.time >= cutoff && londonDate(bar.time) < today);
  if (window.length < 50) return null;
  return Math.min(...window.map((bar) => bar.low));
}

function todayExtreme(bars: readonly Bar[], date: string, field: "low" | "high"): number | null {
  const today = bars.filter((bar) => londonDate(bar.time) === date);
  if (today.length === 0) return null;
  return field === "low" ? Math.min(...today.map((bar) => bar.low)) : Math.max(...today.map((bar) => bar.high));
}

function frameTrend(bars: readonly Bar[]): Frame {
  if (bars.length < 50) return { dir: "flat", ma: false, structure: false };
  const closes = bars.map((bar) => bar.close);
  const last = closes.at(-1);
  const ma20 = average(closes.slice(-20));
  const ma50 = average(closes.slice(-50));
  const maUp = last != null && last > ma20 && last > ma50;
  const maDown = last != null && last < ma20 && last < ma50;
  const { highs, lows } = swings(bars);
  const hhhl =
    highs.length >= 2 &&
    lows.length >= 2 &&
    highs[highs.length - 1]! > highs[highs.length - 2]! &&
    lows[lows.length - 1]! > lows[lows.length - 2]!;
  const lhll =
    highs.length >= 2 &&
    lows.length >= 2 &&
    highs[highs.length - 1]! < highs[highs.length - 2]! &&
    lows[lows.length - 1]! < lows[lows.length - 2]!;
  const up = (maUp || hhhl) && !(maDown && lhll && !maUp && !hhhl);
  const down = (maDown || lhll) && !(maUp && hhhl && !maDown && !lhll);
  if (up && !down) return { dir: "up", ma: maUp, structure: hhhl };
  if (down && !up) return { dir: "down", ma: maDown, structure: lhll };
  return { dir: "flat", ma: false, structure: false };
}

function swings(bars: readonly Bar[]): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  const wing = 2;
  for (let i = wing; i < bars.length - wing; i++) {
    const bar = bars[i];
    if (!bar) continue;
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= wing; j++) {
      const left = bars[i - j];
      const right = bars[i + j];
      if (!left || !right || bar.high <= left.high || bar.high <= right.high) isHigh = false;
      if (!left || !right || bar.low >= left.low || bar.low >= right.low) isLow = false;
    }
    if (isHigh) highs.push(bar.high);
    if (isLow) lows.push(bar.low);
  }
  return { highs, lows };
}

function averageTrueRange(bars: readonly Bar[], period: number): number | null {
  if (bars.length < period + 1) return null;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const bar = bars[i];
    const prev = bars[i - 1];
    if (!bar || !prev) return null;
    sum += Math.max(bar.high - bar.low, Math.abs(bar.high - prev.close), Math.abs(bar.low - prev.close));
  }
  return sum / period;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dedupeLevels(levels: Level[]): Level[] {
  const seen = new Set<string>();
  const out: Level[] = [];
  for (const level of levels) {
    const key = level.price.toFixed(6);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(level);
  }
  return out;
}

function emptySetup(spec: Spec, side: Side, reason: string): Setup {
  return {
    symbol: spec.id,
    side,
    grade: "B",
    entry: 0,
    stop: null,
    r: null,
    half: null,
    target: null,
    level: null,
    trigger: null,
    size: sizeText(spec, 0),
    reason,
  };
}

function downgrade(setup: Setup, reason: string): void {
  setup.grade = "B";
  setup.reason = reason;
}

export function formatSetup(spec: Spec, setup: Setup, clock: LondonClock): string {
  const px = (value: number | null) => (value == null ? "-" : formatPrice(spec, value));
  return [
    `${clock.label} UK`,
    setup.grade,
    `${setup.side.toUpperCase()} ${setup.symbol}`,
    `entry ${px(setup.entry)}`,
    `stop ${px(setup.stop)}`,
    `half ${px(setup.half)}`,
    `2R ${px(setup.target)}`,
    `size ${setup.size}`,
    setup.level ?? "no level",
    setup.trigger ?? "no trigger",
    setup.reason,
  ].join(" | ");
}
