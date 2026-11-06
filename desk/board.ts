// Watchlist quotes for Scout Desk. Public Yahoo v8 charts only.
// Volume text comes from the scanner's assessVolume. No made-up figures.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { londonClock } from "../scanner/clock.js";
import { evaluateSymbol } from "../scanner/rules.js";
import { WATCHLIST, type MarketKind, type Spec } from "../scanner/universe.js";
import { assessVolume, type VolumeStatus, type VolumeTrigger } from "../scanner/volume.js";
import { fetchBars, resample4h, type Bar } from "../scanner/yahoo.js";
import { readTodayAlerts, type TodayAlerts } from "./alerts.js";
import { readScanNote, type ScanNote } from "./status.js";

const CHART_BARS = 120;
const TTL_MS = 60_000;
const FORCE_MIN_MS = 15_000;

export type ChartBar = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
};

export type VolumeView = {
  status: VolumeStatus;
  line: string;
  relative: number | null;
};

export type Tone = "up" | "down" | "flat";

export type BoardRow = {
  id: string;
  name: string;
  kind: MarketKind;
  last: number | null;
  lastText: string;
  change: number | null;
  changeText: string;
  changePercent: number | null;
  changePercentText: string;
  tone: Tone;
  previousClose: number | null;
  previousCloseText: string;
  lastBar: string | null;
  digits: number;
  volume: VolumeView;
  error: string | null;
  chart: ChartBar[];
};

export type LoadedPack =
  | { ok: true; spec: Spec; daily: Bar[]; h1: Bar[]; h4: Bar[]; m15: Bar[] }
  | { ok: false; spec: Spec; error: string };

export type DeskPayload = {
  title: "Scout Desk";
  timezone: "Europe/London";
  date: string;
  clockLabel: string;
  refreshedAt: string;
  reminder: string;
  scan: ScanNote;
  alerts: TodayAlerts;
  rows: BoardRow[];
};

type Cache = { at: number; payload: DeskPayload };

let cache: Cache | null = null;
let pending: Promise<DeskPayload> | null = null;

export function projectRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export async function getDesk(options?: { now?: Date; force?: boolean; root?: string }): Promise<DeskPayload> {
  const now = options?.now ?? new Date();
  const force = options?.force === true;
  const root = options?.root ?? projectRoot();
  const age = cache ? Date.now() - cache.at : Number.POSITIVE_INFINITY;
  let payload: DeskPayload;
  if (cache && age < TTL_MS && (!force || age < FORCE_MIN_MS)) {
    payload = cache.payload;
  } else if (pending) {
    payload = await pending;
  } else {
    console.log(`Scout Desk loading ${WATCHLIST.length} symbols…`);
    const job = buildDesk(now, root).then((built) => {
      cache = { at: Date.now(), payload: built };
      const priced = built.rows.filter((row) => row.last != null).length;
      console.log(`Scout Desk loaded ${priced}/${built.rows.length} prices`);
      return built;
    });
    pending = job;
    job.finally(() => {
      if (pending === job) pending = null;
    });
    payload = await job;
  }
  // Alert files are local and cheap. Reload them even when quotes are cached.
  return attachFiles(payload, root, now);
}

async function attachFiles(payload: DeskPayload, root: string, now: Date): Promise<DeskPayload> {
  const clock = londonClock(now);
  const [alerts, scan] = await Promise.all([readTodayAlerts(root, now), readScanNote(root, now)]);
  return { ...payload, date: clock.date, clockLabel: clock.label, refreshedAt: now.toISOString(), alerts, scan };
}

export async function buildDesk(now: Date, root: string): Promise<DeskPayload> {
  const clock = londonClock(now);
  const [packs, alerts, scan] = await Promise.all([
    mapPool(WATCHLIST, 3, loadPack),
    readTodayAlerts(root, now),
    readScanNote(root, now),
  ]);
  return {
    title: "Scout Desk",
    timezone: "Europe/London",
    date: clock.date,
    clockLabel: clock.label,
    refreshedAt: now.toISOString(),
    reminder: "Research and alerts only. Nothing is sent.",
    scan,
    alerts,
    rows: assembleRows(packs, now),
  };
}

/** One row per loaded name, in watchlist order. Failed fetches stay on the board. */
export function assembleRows(packs: readonly LoadedPack[], now: Date): BoardRow[] {
  return packs.map((pack) => (pack.ok ? rowFromPack(pack, now) : blankRow(pack.spec, pack.error)));
}

export function dayMove(
  daily: readonly Bar[],
  last: number | null,
): { change: number | null; changePercent: number | null; previousClose: number | null } {
  const previous = daily.length >= 2 ? daily[daily.length - 2] : undefined;
  if (last == null || !previous || !(previous.close > 0)) {
    return { change: null, changePercent: null, previousClose: null };
  }
  const change = last - previous.close;
  return { change, changePercent: (change / previous.close) * 100, previousClose: previous.close };
}

function rowFromPack(pack: Extract<LoadedPack, { ok: true }>, now: Date): BoardRow {
  const { spec, daily, h1 } = pack;
  const bar = h1.at(-1) ?? daily.at(-1) ?? null;
  const last = bar?.close ?? null;
  if (last == null) return blankRow(spec, "No price in the feed");
  const move = dayMove(daily, last);
  const volume = volumeFor(pack, now);
  const tone = toneOf(move.change, spec.digits);
  return {
    id: spec.id,
    name: spec.name,
    kind: spec.kind,
    last,
    lastText: grouped(spec.digits, last),
    change: move.change,
    changeText: move.change == null ? "—" : signed(spec.digits, move.change),
    changePercent: move.changePercent,
    changePercentText: move.changePercent == null ? "—" : signedPercent(move.changePercent),
    tone,
    previousClose: move.previousClose,
    previousCloseText: move.previousClose == null ? "—" : grouped(spec.digits, move.previousClose),
    lastBar: bar ? londonStamp(bar.time) : null,
    digits: spec.digits,
    volume,
    error: null,
    chart: chartBars(h1, volume),
  };
}

function volumeFor(pack: Extract<LoadedPack, { ok: true }>, now: Date): VolumeView {
  const clock = londonClock(now);
  const plan = evaluateSymbol(pack.spec, pack.daily, pack.h1, pack.h4, pack.m15, {
    now,
    clock,
    oilChangePercent: null,
    us500ChangePercent: null,
    hotUsData: false,
    qqqEarningsMiss: false,
  });
  const last = pack.h1.at(-1);
  const side = last && last.close < last.open ? "short" : "long";
  const setup = side === "short" ? plan.short : plan.long;
  const trigger: VolumeTrigger = setup.trigger === "break" || setup.trigger === "retest" ? setup.trigger : null;
  const read = assessVolume(pack.spec, side, trigger, pack.h1, now.getTime());
  return { status: read.status, line: read.line, relative: read.relative };
}

function chartBars(h1: readonly Bar[], volume: VolumeView): ChartBar[] {
  return h1.slice(-CHART_BARS).map((bar) => ({
    t: bar.time,
    o: bar.open,
    h: bar.high,
    l: bar.low,
    c: bar.close,
    v: volume.status === "unavailable" ? null : traded(bar.volume),
  }));
}

function blankRow(spec: Spec, error: string): BoardRow {
  const volume: VolumeView =
    spec.kind === "fx"
      ? {
          status: "unavailable",
          line: "Volume: not available (spot forex has no reliable traded volume)",
          relative: null,
        }
      : { status: "unavailable", line: "Volume: not available (no reliable traded volume in the feed)", relative: null };
  return {
    id: spec.id,
    name: spec.name,
    kind: spec.kind,
    last: null,
    lastText: "—",
    change: null,
    changeText: "—",
    changePercent: null,
    changePercentText: "—",
    tone: "flat",
    previousClose: null,
    previousCloseText: "—",
    lastBar: null,
    digits: spec.digits,
    volume,
    error,
    chart: [],
  };
}

function traded(volume: number | null): number | null {
  if (volume == null || !Number.isFinite(volume) || volume <= 0) return null;
  return volume;
}

function toneOf(change: number | null, digits: number): Tone {
  if (change == null) return "flat";
  const rounded = Number(change.toFixed(digits));
  if (rounded > 0) return "up";
  if (rounded < 0) return "down";
  return "flat";
}

function grouped(digits: number, value: number): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: true,
  }).format(value);
}

function signed(digits: number, value: number): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: true,
    signDisplay: "exceptZero",
  }).format(value);
}

function signedPercent(value: number): string {
  const text = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(value);
  return `${text}%`;
}

function londonStamp(ms: number): string {
  const clock = londonClock(new Date(ms));
  return `${clock.date} ${clock.label} UK`;
}

async function loadPack(spec: Spec): Promise<LoadedPack> {
  try {
    const [daily, h1, m15] = await Promise.all([
      fetchBars(spec.yahoo, "1d", "2y"),
      fetchBars(spec.yahoo, "1h", "60d"),
      fetchBars(spec.yahoo, "15m", "5d"),
    ]);
    return { ok: true, spec, daily, h1, h4: resample4h(h1), m15 };
  } catch (err) {
    return { ok: false, spec, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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
