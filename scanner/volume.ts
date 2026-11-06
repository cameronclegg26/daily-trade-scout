// Relative volume for a break or retest. Research only. No orders.
// Gold, crypto, listed stocks, index futures, and oil use traded volume.
// Spot forex is refused: that feed has no reliable traded volume.

import type { Bar } from "./yahoo.js";
import type { Spec } from "./universe.js";

export type VolumeSide = "long" | "short";
export type VolumeTrigger = "break" | "retest" | null;
export type VolumeStatus = "backing" | "not_confirming" | "unavailable";

export type VolumeReadout = {
  status: VolumeStatus;
  line: string;
  /** One-decimal relative volume, or null when the line has no figure. */
  relative: number | null;
};

const LOOKBACK = 20;
const MIN_SAMPLE = 10;
/** At or above this multiple, volume is meaningfully above the recent average. */
const MEANINGFUL = 1.2;
/** A step-up of this size counts as expanding. */
const EXPAND = 1.1;
const MIN_OPEN_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const FOREX_LINE = "Volume: not available (spot forex has no reliable traded volume)";
const FEED_LINE = "Volume: not available (no reliable traded volume in the feed)";
const BAR_LINE = "Volume: not available (the setup bar has no traded volume in the feed)";

type Choice = { index: number; volume: number; closedHour: boolean };

export function assessVolume(
  spec: Spec,
  side: VolumeSide,
  trigger: VolumeTrigger,
  bars: readonly Bar[],
  nowMs: number,
): VolumeReadout {
  if (spec.kind === "fx") return unavailable(FOREX_LINE);
  const series = bars.filter((bar) => bar.time > 0 && bar.close > 0);
  if (countTraded(series) < MIN_SAMPLE + 1) return unavailable(FEED_LINE);
  const interval = intervalOf(series);
  const choice = chooseSignal(series, interval, nowMs);
  if (!choice) return unavailable(signalMissing(series, interval, nowMs) ? BAR_LINE : FEED_LINE);
  const prior = volumesBefore(series, choice.index).slice(-LOOKBACK);
  if (prior.length < MIN_SAMPLE) return unavailable(FEED_LINE);
  const average = mean(prior);
  if (!(average > 0)) return unavailable(FEED_LINE);

  const shown = Math.round((choice.volume / average) * 10) / 10;
  const multiple = `${shown.toFixed(1)}x average`;
  const suffix = choice.closedHour ? ", last closed hour" : "";
  const expanding = isExpanding(choice.volume, prior);
  const signal = series[choice.index];
  const diverging = signal ? isDiverging(side, series, choice.index, choice.volume) : false;
  const against = signal ? isAgainst(side, signal) : false;

  if (diverging) return reading("not_confirming", `Volume: not confirming (diverging, ${multiple}${suffix})`, shown);
  if (against) return reading("not_confirming", `Volume: not confirming (against the move, ${multiple}${suffix})`, shown);
  if (shown >= MEANINGFUL || expanding) {
    if (trigger == null) {
      return reading("not_confirming", `Volume: not confirming (no break or retest, ${multiple}${suffix})`, shown);
    }
    const detail = shown >= MEANINGFUL ? `${multiple}${suffix}` : `${multiple}, expanding${suffix}`;
    return reading("backing", `Volume: backing the move (${detail})`, shown);
  }
  if (shown < 1) return reading("not_confirming", `Volume: not confirming (light, ${multiple}${suffix})`, shown);
  return reading("not_confirming", `Volume: not confirming (not above average, ${multiple}${suffix})`, shown);
}

function unavailable(line: string): VolumeReadout {
  return { status: "unavailable", line, relative: null };
}

function reading(status: VolumeStatus, line: string, relative: number): VolumeReadout {
  return { status, line, relative };
}

function chooseSignal(series: readonly Bar[], interval: number, nowMs: number): Choice | null {
  const lastIndex = series.length - 1;
  const last = series[lastIndex];
  if (!last) return null;
  const elapsed = nowMs - last.time;
  const raw = traded(last.volume);
  const inProgress = elapsed >= 0 && elapsed < interval - 30_000;

  if (inProgress && raw != null && elapsed >= MIN_OPEN_MS) {
    return { index: lastIndex, volume: raw * (interval / elapsed), closedHour: false };
  }
  if (inProgress && elapsed < MIN_OPEN_MS) {
    const average = averageBefore(series, lastIndex);
    if (raw != null && average != null && raw / average >= MEANINGFUL) {
      return { index: lastIndex, volume: raw, closedHour: false };
    }
    return previousChoice(series, lastIndex - 1, interval, nowMs);
  }
  // The last bar is the setup bar, including a stock hour after the cash session has closed.
  if (raw != null && elapsed >= 0) return { index: lastIndex, volume: raw, closedHour: elapsed > interval };
  return null;
}

function signalMissing(series: readonly Bar[], interval: number, nowMs: number): boolean {
  const last = series.at(-1);
  if (!last) return false;
  const elapsed = nowMs - last.time;
  const fresh = elapsed >= 0 && elapsed <= interval * 2;
  return fresh && traded(last.volume) == null && countTraded(series) >= MIN_SAMPLE + 1;
}

function previousChoice(
  series: readonly Bar[],
  from: number,
  interval: number,
  nowMs: number,
): Choice | null {
  for (let i = from; i >= 0; i--) {
    const bar = series[i];
    const volume = bar ? traded(bar.volume) : null;
    if (!bar || volume == null) continue;
    if (nowMs - bar.time > interval * 2) return null;
    return { index: i, volume, closedHour: true };
  }
  return null;
}

function averageBefore(series: readonly Bar[], index: number): number | null {
  const prior = volumesBefore(series, index).slice(-LOOKBACK);
  if (prior.length < MIN_SAMPLE) return null;
  const value = mean(prior);
  return value > 0 ? value : null;
}

function isExpanding(volume: number, prior: number[]): boolean {
  const prev = prior.at(-1);
  const last3 = prior.slice(-3);
  if (prev == null || last3.length < 3) return false;
  return grew(volume, prev) && grew(volume, mean(last3));
}

function grew(volume: number, base: number): boolean {
  if (!(base > 0)) return false;
  return volume >= base * EXPAND - base * 1e-9;
}

function isDiverging(side: VolumeSide, series: readonly Bar[], index: number, signalVolume: number): boolean {
  if (index < 3) return false;
  const window = series.slice(index - 3, index + 1);
  const first = window[0];
  const last = window[3];
  const midA = window[1];
  const midB = window[2];
  if (!first || !last || !midA || !midB) return false;
  const extended = side === "long" ? last.close > first.close : last.close < first.close;
  if (!extended) return false;
  const older = traded(midA.volume);
  const newer = traded(midB.volume);
  if (older == null || newer == null) return false;
  return signalVolume < newer && newer < older;
}

function isAgainst(side: VolumeSide, bar: Bar): boolean {
  return side === "long" ? bar.close < bar.open : bar.close > bar.open;
}

function volumesBefore(series: readonly Bar[], index: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < index; i++) {
    const volume = traded(series[i]?.volume);
    if (volume != null) out.push(volume);
  }
  return out;
}

function countTraded(series: readonly Bar[]): number {
  return series.reduce((count, bar) => count + (traded(bar.volume) == null ? 0 : 1), 0);
}

function traded(volume: number | null | undefined): number | null {
  if (volume == null || !Number.isFinite(volume) || volume <= 0) return null;
  return volume;
}

function intervalOf(series: readonly Bar[]): number {
  const gaps: number[] = [];
  const start = Math.max(1, series.length - 40);
  for (let i = start; i < series.length; i++) {
    const left = series[i - 1];
    const right = series[i];
    if (!left || !right) continue;
    const gap = right.time - left.time;
    if (gap >= 30 * 60 * 1000 && gap <= 2 * HOUR_MS) gaps.push(gap);
  }
  if (gaps.length === 0) return HOUR_MS;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] ?? HOUR_MS;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
