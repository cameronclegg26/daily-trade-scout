import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { londonClock } from "../scanner/clock.js";
import { formatSetup, type Setup } from "../scanner/rules.js";
import { formatPrice, WATCHLIST, type Spec } from "../scanner/universe.js";
import { assessVolume } from "../scanner/volume.js";
import type { Bar } from "../scanner/yahoo.js";
import { parseAlertLines, readTodayAlerts } from "./alerts.js";
import { assembleRows, dayMove, type LoadedPack } from "./board.js";
import { DESK_HOST } from "./host.js";
import { readScanNote } from "./status.js";

const HOUR = 60 * 60 * 1000;
const FOREX = "Volume: not available (spot forex has no reliable traded volume)";

function spec(id: string): Spec {
  const found = WATCHLIST.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function series(volumes: number[]): Bar[] {
  const start = Date.parse("2026-11-02T00:00:00Z");
  return volumes.map((volume, i) => {
    const close = 100 + i;
    const open = close - 0.5;
    return {
      time: start + i * HOUR,
      open,
      high: close + 0.5,
      low: open - 0.5,
      close,
      volume,
    };
  });
}

function pack(item: Spec, h1: Bar[], daily: Bar[], ok = true): LoadedPack {
  if (!ok) return { ok: false, spec: item, error: "offline" };
  return { ok: true, spec: item, daily, h1, h4: [], m15: [] };
}

test("day change uses the prior close and the latest price", () => {
  const daily: Bar[] = [
    { time: 1, open: 90, high: 101, low: 89, close: 100, volume: 10 },
    { time: 2, open: 100, high: 120, low: 99, close: 118, volume: 10 },
  ];
  const move = dayMove(daily, 112);
  assert.equal(move.previousClose, 100);
  assert.equal(move.change, 12);
  assert.equal(move.changePercent, 12);
  assert.deepEqual(dayMove([daily[0]!], 112), { change: null, changePercent: null, previousClose: null });
});

test("the board keeps watchlist order and does not invent a forex volume figure", () => {
  const volumes = [...Array(23).fill(1000), 1800];
  const h1 = series(volumes);
  const now = new Date(h1.at(-1)!.time + HOUR);
  const daily: Bar[] = [
    { time: Date.parse("2026-11-02T00:00:00Z"), open: 90, high: 110, low: 90, close: 100, volume: 1 },
    { time: Date.parse("2026-11-03T00:00:00Z"), open: 100, high: 130, low: 100, close: 130, volume: 1 },
  ];
  const gbp = spec("GBPUSD");
  const gold = spec("GOLD");
  const extra: Spec = { id: "COPPER", name: "Copper", yahoo: "HG=F", kind: "index", round: 0.01, digits: 4 };
  const rows = assembleRows(
    [
      pack(gbp, h1, daily),
      pack(gold, h1, daily),
      { ok: false, spec: extra, error: "offline" },
    ],
    now,
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ["GBPUSD", "GOLD", "COPPER"],
  );

  const fx = rows[0]!;
  assert.equal(fx.volume.line, FOREX);
  assert.equal(fx.volume.status, "unavailable");
  assert.equal(fx.volume.relative, null);
  assert.equal(fx.last, h1.at(-1)!.close);
  assert.ok(fx.chart.every((bar) => bar.v == null));
  assert.deepEqual(
    fx.chart.map((bar) => bar.c),
    h1.map((bar) => bar.close),
  );

  const metal = rows[1]!;
  const expected = assessVolume(gold, "long", null, h1, now.getTime());
  assert.equal(metal.volume.line, expected.line);
  assert.equal(metal.volume.relative, 1.8);
  assert.match(metal.volume.line, /1\.8x average/);
  assert.notEqual(metal.volume.line, FOREX);
  assert.deepEqual(
    metal.chart.map((bar) => [bar.c, bar.v]),
    h1.map((bar) => [bar.close, bar.volume]),
  );
  assert.equal(metal.change, h1.at(-1)!.close - 100);
  assert.equal(rows[2]!.last, null);
  assert.match(rows[2]!.volume.line, /^Volume: not available/);
  assert.equal(rows[2]!.error, "offline");
});

test("a failed watchlist still lists every name in watchlist order", () => {
  const now = new Date("2026-11-06T16:00:00Z");
  const rows = assembleRows(
    WATCHLIST.map((item) => ({ ok: false as const, spec: item, error: "offline" })),
    now,
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    WATCHLIST.map((item) => item.id),
  );
  const fx = rows.find((row) => row.id === "GBPUSD");
  assert.equal(fx?.volume.line, FOREX);
  assert.equal(fx?.last, null);
});

test("today's A and A+ lines keep the scanner volume wording", () => {
  const qqq = spec("QQQ");
  const setup: Setup = {
    symbol: "QQQ",
    side: "long",
    grade: "A",
    entry: 110.15,
    stop: 108.15,
    r: 2,
    half: 112.15,
    target: 114.15,
    level: "PDH 109.50",
    trigger: "break",
    volumeLine: "Volume: not confirming (light, 0.4x average)",
    size: "100.00 price-units at $1 per unit (200 / stop)",
    reason: "D/4H/1H agree",
  };
  const cable = spec("GBPUSD");
  const fxSetup: Setup = {
    ...setup,
    symbol: "GBPUSD",
    side: "short",
    grade: "A+",
    entry: 1.25,
    stop: 1.252,
    half: 1.248,
    target: 1.246,
    level: "PDL 1.25100",
    trigger: "retest",
    volumeLine: FOREX,
    reason: "D/4H/1H agree on structure and the 20/50 averages",
  };
  const clock = londonClock(new Date("2026-11-06T15:30:00Z"));
  const text = [
    `# Alerts ${clock.date} (Europe/London)`,
    "",
    "Research only. This scanner does not place live orders.",
    "",
    `${formatSetup(qqq, setup, clock)} | paired SHORT B: daily, 4h, and 1h do not agree`,
    `${clock.label} UK | LESSON | QQQ long loss -200. The stop level was wrong.`,
    `${formatSetup(cable, fxSetup, clock)} | paired LONG B: no break or retest of a key level`,
    `15:31 UK | B | LONG QQQ | entry 1 | stop 1 | half 1 | 2R 1 | size 1 | level | break | Volume: backing the move (9.9x average) | reason`,
  ].join("\r\n");
  const ideas = parseAlertLines(text);
  assert.equal(ideas.length, 2);
  assert.equal(ideas[0]?.grade, "A");
  assert.equal(ideas[0]?.side, "long");
  assert.equal(ideas[0]?.symbol, "QQQ");
  assert.equal(ideas[0]?.entry, formatPrice(qqq, 110.15));
  assert.equal(ideas[0]?.stop, formatPrice(qqq, 108.15));
  assert.equal(ideas[0]?.half, formatPrice(qqq, 112.15));
  assert.equal(ideas[0]?.target, formatPrice(qqq, 114.15));
  assert.equal(ideas[0]?.trigger, "break");
  assert.equal(ideas[0]?.level, "PDH 109.50");
  assert.equal(ideas[0]?.volumeLine, "Volume: not confirming (light, 0.4x average)");
  assert.equal(ideas[0]?.paired, "SHORT B: daily, 4h, and 1h do not agree");
  assert.equal(ideas[1]?.grade, "A+");
  assert.equal(ideas[1]?.side, "short");
  assert.equal(ideas[1]?.symbol, "GBPUSD");
  assert.equal(ideas[1]?.volumeLine, FOREX);
  assert.equal(ideas[1]?.trigger, "retest");
});

test("today's alert file is the London date, and a missing file is empty", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "scout-desk-"));
  try {
    const now = new Date("2026-11-06T15:30:00Z");
    const date = londonClock(now).date;
    const missing = await readTodayAlerts(root, now);
    assert.equal(missing.found, false);
    assert.deepEqual(missing.ideas, []);
    assert.equal(missing.file, `alerts/${date}.md`);

    await mkdir(path.join(root, "alerts"), { recursive: true });
    const line = [
      "15:30 UK",
      "A+",
      "LONG GOLD",
      "entry 2645.30",
      "stop 2635.30",
      "half 2655.30",
      "2R 2665.30",
      "size 2.00 x 10oz ($10 per $1)",
      "PDH 2640.00",
      "break",
      "Volume: backing the move (1.8x average)",
      "D/4H/1H agree",
      "paired SHORT B: no break or retest of a key level",
    ].join(" | ");
    await writeFile(path.join(root, "alerts", "2020-01-01.md"), `${line}\n`, "utf8");
    const otherDay = await readTodayAlerts(root, now);
    assert.equal(otherDay.found, false);

    await writeFile(path.join(root, "alerts", `${date}.md`), `${line}\n`, "utf8");
    const today = await readTodayAlerts(root, now);
    assert.equal(today.found, true);
    assert.equal(today.ideas.length, 1);
    assert.equal(today.ideas[0]?.volumeLine, "Volume: backing the move (1.8x average)");
    assert.equal(today.ideas[0]?.target, "2665.30");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the paper-log note is today only and never a live order", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "scout-desk-"));
  try {
    const now = new Date("2026-11-06T16:00:00Z");
    const none = await readScanNote(root, now);
    assert.match(none.summary, /No scan recorded yet/);
    assert.match(none.summary, /Nothing is sent/);

    await mkdir(path.join(root, "scanner"), { recursive: true });
    const file = path.join(root, "scanner", "state.json");
    await writeFile(file, JSON.stringify({ date: "2020-01-01", losses: 2, dayPnl: -400 }), "utf8");
    const stale = await readScanNote(root, now);
    assert.match(stale.summary, /Last scan/);
    assert.doesNotMatch(stale.summary, /losses/);

    await writeFile(
      file,
      JSON.stringify({ date: londonClock(now).date, losses: 2, dayPnl: -400 }),
      "utf8",
    );
    const fresh = await readScanNote(root, now);
    assert.match(fresh.summary, /paper log 2 losses/);
    assert.match(fresh.summary, /day pnl -400/);
    assert.match(fresh.summary, /will not add new alerts today/);
    assert.match(fresh.summary, /Nothing is sent/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the desk stays on localhost and the page has no order ticket", async () => {
  assert.equal(DESK_HOST, "127.0.0.1");
  const server = await readFile(new URL("./server.ts", import.meta.url), "utf8");
  assert.match(server, /listen\(port, DESK_HOST,/);
  assert.doesNotMatch(server, /0\.0\.0\.0|broker|placeOrder|order ticket/i);
  const page = (
    await Promise.all(
      ["index.html", "desk.css", "desk.js"].map((name) =>
        readFile(new URL(`./public/${name}`, import.meta.url), "utf8"),
      ),
    )
  ).join("\n");
  assert.match(page, /Scout Desk/);
  assert.doesNotMatch(page, /bloomberg/i);
  assert.doesNotMatch(page, /\b(buy|sell|broker)\b/i);
  assert.doesNotMatch(page, /order ticket/i);
});
