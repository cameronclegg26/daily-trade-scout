import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { londonClock, timingBlock } from "./clock.js";
import { cryptoCanAlert, cryptoWatchTag, formatCryptoAlert, WATCH_ONLY_TAG } from "./crypto.js";
import {
  alreadyWatched,
  appendAlert,
  directionFlip,
  emptyBook,
  loadBook,
  markToMarket,
  openRisk,
  saveBook,
  trackIdea,
  trackWatch,
} from "./journal.js";
import { evaluateSymbol, formatSetup, type ScanContext, type Setup } from "./rules.js";
import { CRYPTO_WATCHLIST, RISK_DOLLARS, sizeText, WATCHLIST, type Spec } from "./universe.js";
import type { Bar } from "./yahoo.js";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function rising(count: number, startMs: number, stepMs: number, start: number, step: number): Bar[] {
  return Array.from({ length: count }, (_, i) => {
    const close = start + (i + 1) * step;
    return {
      time: startMs + i * stepMs,
      open: close - step * 0.3,
      high: close + step * 0.4,
      low: close - step * 0.4,
      close,
    };
  });
}

function quote(price: number, time: number): Bar {
  return { time, open: price, high: price, low: price, close: price };
}

function sampleSetup(spec: Spec, overrides: Partial<Setup> = {}): Setup {
  return {
    symbol: spec.id,
    side: "long",
    grade: "A",
    entry: 100,
    stop: 90,
    r: 10,
    half: 110,
    target: 120,
    level: "round 100.0",
    trigger: "break",
    size: sizeText(spec, 10),
    reason: "D/4H/1H agree",
    ...overrides,
  };
}

test("crypto watchlist is BTC, ETH, SOL, XRP, and ZEC on Yahoo", () => {
  assert.deepEqual(
    CRYPTO_WATCHLIST.map((spec) => spec.id),
    ["BTC", "ETH", "SOL", "XRP", "ZEC"],
  );
  assert.deepEqual(
    CRYPTO_WATCHLIST.map((spec) => spec.yahoo),
    ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "ZEC-USD"],
  );
  assert.equal(WATCHLIST.some((spec) => spec.id === "XRP"), false);
  assert.equal(WATCHLIST.length, 12);
  for (const id of ["BTC", "ETH", "SOL", "ZEC"]) {
    assert.equal(
      CRYPTO_WATCHLIST.find((spec) => spec.id === id),
      WATCHLIST.find((spec) => spec.id === id),
    );
  }
  const xrp = CRYPTO_WATCHLIST.find((spec) => spec.id === "XRP");
  assert.equal(xrp?.kind, "crypto");
  assert.equal(xrp?.round, 0.01);
  assert.equal(xrp?.digits, 4);
});

test("before 15:15 UK is watch only, including weekends, and 15:15 is an entry", () => {
  const before = londonClock(new Date("2026-11-18T15:14:00Z"));
  const at = londonClock(new Date("2026-11-18T15:15:00Z"));
  const after = londonClock(new Date("2026-11-18T16:00:00Z"));
  const early = londonClock(new Date("2026-11-18T09:00:00Z"));
  const bstBefore = londonClock(new Date("2026-07-15T14:14:00Z"));
  const bstAt = londonClock(new Date("2026-07-15T14:15:00Z"));
  const saturday = londonClock(new Date("2026-11-21T10:00:00Z"));
  assert.equal(before.label, "15:14");
  assert.equal(at.label, "15:15");
  assert.equal(bstBefore.label, "15:14");
  assert.equal(bstAt.label, "15:15");
  assert.equal(cryptoWatchTag(before), WATCH_ONLY_TAG);
  assert.equal(cryptoWatchTag(early), WATCH_ONLY_TAG);
  assert.equal(cryptoWatchTag(bstBefore), WATCH_ONLY_TAG);
  assert.equal(cryptoWatchTag(saturday), WATCH_ONLY_TAG);
  assert.equal(cryptoWatchTag(at), null);
  assert.equal(cryptoWatchTag(after), null);
  assert.equal(cryptoWatchTag(bstAt), null);
  assert.match(timingBlock(saturday) ?? "", /weekend/);
  assert.match(timingBlock(londonClock(new Date("2026-11-18T14:30:00Z"))) ?? "", /14:30/);
  const setup = sampleSetup(CRYPTO_WATCHLIST[0]!);
  assert.equal(cryptoCanAlert(setup), true);
  assert.equal(cryptoCanAlert({ ...setup, grade: "B" }), false);
});

test("alert line matches the weekday scanner, with the watch tag only before 15:15", () => {
  const spec = CRYPTO_WATCHLIST[0]!;
  const setup = sampleSetup(spec);
  const paired = sampleSetup(spec, { side: "short", grade: "B", reason: "daily, 4h, and 1h do not agree" });
  const early = londonClock(new Date("2026-11-18T09:05:00Z"));
  const late = londonClock(new Date("2026-11-18T16:05:00Z"));
  const earlyLine = formatCryptoAlert(spec, setup, paired, early);
  const lateLine = formatCryptoAlert(spec, setup, paired, late);
  assert.equal(lateLine, `${formatSetup(spec, setup, late)} | paired SHORT B: daily, 4h, and 1h do not agree`);
  assert.equal(earlyLine, `${formatSetup(spec, setup, early)} | paired SHORT B: daily, 4h, and 1h do not agree | ${WATCH_ONLY_TAG}`);
  assert.match(lateLine, /\| A \| LONG BTC \| entry 100.0 \| stop 90.0 \| half 110.0 \| 2R 120.0 \|/);
  assert.match(lateLine, /200 \/ stop/);
  assert.equal(lateLine.includes(WATCH_ONLY_TAG), false);
});

test("shared grader still requires agreement and pays 2R with a $200 size", () => {
  const now = new Date("2026-11-18T16:00:00Z");
  const clock = londonClock(now);
  const dailyStart = Date.parse("2026-08-30T00:00:00Z");
  const daily = rising(80, dailyStart, DAY, 40, 0.5);
  const h1Start = Date.parse("2026-11-15T18:00:00Z");
  const h1 = rising(70, h1Start, HOUR, 60, 0.5);
  const previous = h1[h1.length - 2]!;
  const last = h1[h1.length - 1]!;
  previous.close = 99.9;
  previous.high = 100.1;
  previous.low = 99.6;
  previous.open = 99.7;
  last.close = 100.02;
  last.open = 99.95;
  last.high = 100.08;
  last.low = 99.92;
  const h4 = rising(60, Date.parse("2026-11-08T00:00:00Z"), 4 * HOUR, 50, 0.8);
  const m15 = rising(8, Date.parse("2026-11-17T12:00:00Z"), 15 * 60 * 1000, 90, 0.2);
  const ctx: ScanContext = {
    now,
    clock,
    oilChangePercent: null,
    us500ChangePercent: null,
    hotUsData: false,
    qqqEarningsMiss: false,
  };
  const spec: Spec = { id: "BTC", name: "Bitcoin", yahoo: "BTC-USD", kind: "crypto", round: 1, digits: 2 };
  const plan = evaluateSymbol(spec, daily, h1, h4, m15, ctx);
  assert.equal(plan.error, null);
  assert.notEqual(plan.long.grade, "B");
  assert.equal(plan.long.stop != null && plan.long.r != null && plan.long.half != null && plan.long.target != null, true);
  assert.ok(Math.abs((plan.long.target ?? 0) - (plan.long.entry + 2 * (plan.long.r ?? 0))) < 1e-6);
  assert.match(plan.long.size, /200 \/ stop/);
  assert.equal(plan.long.trigger === "break" || plan.long.trigger === "retest", true);
});

test("$200 risk, half at 1R moves the stop to entry, and 2R pays 300", () => {
  const spec = CRYPTO_WATCHLIST[1]!;
  const book = emptyBook("2026-11-18");
  const setup = sampleSetup(spec, { symbol: "ETH" });
  assert.equal(RISK_DOLLARS, 200);
  assert.equal(setup.size, "20.00 price-units at $1 per unit (200 / stop)");
  trackIdea(book, setup, "2026-11-18T16:00:00.000Z");
  const opened = Date.parse("2026-11-18T16:30:00Z");
  const halfLessons = markToMarket(book, spec, [{ time: opened, open: 108, high: 110, low: 101, close: 109 }]);
  const idea = book.ideas[0]!;
  assert.equal(idea.partial, true);
  assert.equal(idea.stop, idea.entry);
  assert.match(halfLessons[0] ?? "", /half off, stop moved to entry/);
  const winLessons = markToMarket(book, spec, [{ time: opened + HOUR, open: 115, high: 120, low: 111, close: 118 }]);
  assert.equal(idea.status, "win");
  assert.equal(idea.pnl, 300);
  assert.equal(book.dayPnl, 300);
  assert.match(winLessons[0] ?? "", /Half at 1R, rest at 2R/);
});

test("a full stop is a $200 loss and does not widen", () => {
  const spec = CRYPTO_WATCHLIST[2]!;
  const book = emptyBook("2026-11-18");
  const setup = sampleSetup(spec, { symbol: "SOL", side: "long" });
  trackIdea(book, setup, "2026-11-18T16:00:00.000Z");
  const lessons = markToMarket(book, spec, [quote(90, Date.parse("2026-11-18T16:10:00Z"))]);
  const idea = book.ideas[0]!;
  assert.equal(idea.status, "loss");
  assert.equal(idea.pnl, -200);
  assert.equal(idea.stop, 90);
  assert.equal(book.losses, 1);
  assert.match(lessons[0] ?? "", /loss -200/);
});

test("a watch is not an entry, and the same setup can alert after 15:15", () => {
  const spec = CRYPTO_WATCHLIST[0]!;
  const book = emptyBook("2026-11-18");
  const setup = sampleSetup(spec);
  const key = "2026-11-18|BTC|long|round 100.0";
  trackWatch(book, key);
  assert.equal(alreadyWatched(book, key), true);
  assert.equal(book.ideas.length, 0);
  assert.equal(openRisk(book), 0);
  assert.equal(directionFlip(book, "BTC", "short"), false);
  trackIdea(book, setup, "2026-11-18T15:20:00.000Z");
  assert.equal(book.ideas.length, 1);
  assert.equal(openRisk(book), 200);
  assert.equal(directionFlip(book, "BTC", "short"), true);
});

test("alert files keep the research header and the weekday folder stays separate", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "crypto-alerts-"));
  const cryptoDir = path.join(root, "alerts-crypto");
  const date = "2099-03-01";
  try {
    await appendAlert(date, "09:00 UK | A | LONG BTC | sample", cryptoDir);
    await appendAlert(date, "16:00 UK | A | LONG ETH | sample", cryptoDir);
    const text = await readFile(path.join(cryptoDir, `${date}.md`), "utf8");
    assert.equal(
      text.startsWith(
        [
          `# Alerts ${date} (Europe/London)`,
          "",
          "Research only. This scanner does not place live orders. It has no broker connection and it does not sign or send wallet transactions.",
          "",
        ].join("\n"),
      ),
      true,
    );
    assert.equal(text.split("Research only.").length, 2);
    const weekday = path.resolve("alerts", `${date}.md`);
    await rm(weekday, { force: true });
    await appendAlert(date, "weekday line");
    const weekdayText = await readFile(weekday, "utf8");
    assert.match(weekdayText, /Research only/);
    assert.match(weekdayText, /weekday line/);
    assert.equal(weekdayText.includes("LONG BTC"), false);
    await rm(weekday, { force: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("crypto book file keeps watches, and a weekday book does not grow a watches field", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "crypto-book-"));
  const cryptoState = path.join(root, "state-crypto.json");
  const weekdayState = path.join(root, "state.json");
  try {
    const book = emptyBook("2026-11-18");
    trackWatch(book, "2026-11-18|SOL|long|round 73");
    await saveBook(book, cryptoState);
    const loaded = await loadBook("2026-11-18", cryptoState);
    assert.equal(alreadyWatched(loaded, "2026-11-18|SOL|long|round 73"), true);
    const rolled = await loadBook("2026-11-19", cryptoState);
    assert.equal(rolled.watches, undefined);
    const weekday = emptyBook("2026-11-18");
    await saveBook(weekday, weekdayState);
    const raw = await readFile(weekdayState, "utf8");
    assert.equal(raw.includes("watches"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
