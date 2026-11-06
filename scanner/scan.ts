// Rules-only scanner. No model, no tokens, no orders.
import { readFile } from "node:fs/promises";
import { londonClock, timingBlock } from "./clock.js";
import { withHint } from "./desk.js";
import {
  alreadyTracked,
  appendAlert,
  directionFlip,
  flattenForWeekend,
  ideaKey,
  loadBook,
  markToMarket,
  noteValidity,
  openRisk,
  rearmIdea,
  riskBlock,
  saveBook,
  trackIdea,
} from "./journal.js";
import { alertable, dayChangePercent, evaluateSymbol, formatSetup, type SymbolPlan } from "./rules.js";
import { WATCHLIST, type Spec } from "./universe.js";
import { drainTelegram, hintChatId, sendTelegram, telegramReady } from "./telegram.js";
import { fetchBars, resample4h, type Bar } from "./yahoo.js";

const LOOP_MS = 15 * 60 * 1000;

type Pack =
  | { ok: true; spec: Spec; daily: Bar[]; h1: Bar[]; h4: Bar[]; m15: Bar[] }
  | { ok: false; spec: Spec; error: string };

async function main(): Promise<void> {
  const loop = process.argv.includes("--loop");
  do {
    try {
      await scanOnce();
    } catch (err) {
      console.error(err instanceof Error ? err.message : "scan failed");
    }
    if (!loop) break;
    await waitForNextScan(LOOP_MS);
  } while (loop);
}

async function waitForNextScan(ms: number): Promise<void> {
  await loadEnvFile();
  if (!telegramReady()) {
    await sleep(ms);
    return;
  }
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const remain = end - Date.now();
    const timeout = Math.max(1, Math.min(25, Math.floor(remain / 1000)));
    try {
      await ingestIdle(timeout);
    } catch (err) {
      console.error(err instanceof Error ? err.message : "telegram listen failed");
      await sleep(Math.min(5_000, remain));
    }
  }
}

async function ingestIdle(timeout: number): Promise<void> {
  const now = new Date();
  const book = await loadBook(londonClock(now).date);
  const offset = book.telegramOffset;
  const ideas = JSON.stringify(book.ideas);
  await drainTelegram(book, now, timeout);
  if (book.telegramOffset !== offset || JSON.stringify(book.ideas) !== ideas) await saveBook(book);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scanOnce(): Promise<void> {
  await loadEnvFile();
  await hintChatId();
  const now = new Date();
  const clock = londonClock(now);
  const book = await loadBook(clock.date);
  await drainTelegram(book, now, 0);
  const packs = await mapPool(WATCHLIST, 3, loadPack);
  const lessons: string[] = [];
  for (const pack of packs) {
    if (!pack.ok) continue;
    lessons.push(...markToMarket(book, pack.spec, pack.m15));
  }
  if (timingBlock(clock)?.includes("weekend")) lessons.push(...flattenForWeekend(book));

  const oil = packs.find((pack) => pack.ok && pack.spec.id === "OIL");
  const us500 = packs.find((pack) => pack.ok && pack.spec.id === "US500");
  const ctx = {
    now,
    clock,
    oilChangePercent: oil && oil.ok ? dayChangePercent(oil.daily) : null,
    us500ChangePercent: us500 && us500.ok ? dayChangePercent(us500.daily) : null,
    hotUsData: process.env.SCAN_HOT_US_DATA === "1",
    qqqEarningsMiss: process.env.SCAN_QQQ_EARNINGS_MISS === "1",
  };

  let alerts = 0;
  const ready: { spec: Spec; plan: SymbolPlan }[] = [];
  for (const pack of packs) {
    if (!pack.ok) {
      console.log(`${clock.label} UK | ${pack.spec.id} | data error | ${pack.error}`);
      continue;
    }
    ready.push({ spec: pack.spec, plan: evaluateSymbol(pack.spec, pack.daily, pack.h1, pack.h4, pack.m15, ctx) });
  }

  for (const idea of book.ideas) {
    if (idea.status !== "skipped") continue;
    const row = ready.find((item) => item.spec.id === idea.symbol);
    const setup = row == null ? null : idea.side === "long" ? row.plan.long : row.plan.short;
    const live =
      setup != null &&
      setup.stop != null &&
      setup.r != null &&
      alertable(setup, clock).ok &&
      riskBlock(book) == null;
    if (noteValidity(idea, live) !== "ping" || setup == null || row == null) continue;
    rearmIdea(idea, setup, now.toISOString(), book.date);
    alerts += await publish(row.spec, row.plan, idea.side, clock, true);
  }

  for (const row of ready) {
    for (const setup of [row.plan.long, row.plan.short]) {
      const gate = alertable(setup, clock);
      if (!gate.ok || riskBlock(book)) continue;
      if (directionFlip(book, setup.symbol, setup.side)) continue;
      const key = ideaKey(setup, book.date);
      if (alreadyTracked(book, key, setup.symbol, setup.side)) continue;
      if (setup.stop == null || setup.r == null) continue;
      trackIdea(book, setup, now.toISOString());
      alerts += await publish(row.spec, row.plan, setup.side, clock, true);
    }
  }

  for (const lesson of lessons) {
    const line = `${clock.label} UK | LESSON | ${lesson}`;
    await appendAlert(clock.date, line);
    console.log(line);
    await push(line, false);
  }
  await saveBook(book);
  const blocked = riskBlock(book);
  const timing = timingBlock(clock);
  const pending = book.ideas.filter((idea) => idea.status === "pending").length;
  const note = [blocked, timing].filter((item) => item).join(" | ");
  console.log(
    `${clock.date} ${clock.label} UK | scanned ${WATCHLIST.length} | alerts ${alerts} | pending ${pending} | day pnl ${book.dayPnl} | losses ${book.losses} | open risk ${openRisk(book)}${note ? ` | ${note}` : ""} | alerts only, no orders`,
  );
}

async function loadPack(spec: Spec): Promise<Pack> {
  try {
    const [daily, h1, m15] = await Promise.all([
      fetchBars(spec.yahoo, "1d", "2y"),
      fetchBars(spec.yahoo, "1h", "60d"),
      fetchBars(spec.yahoo, "15m", "5d"),
    ]);
    if (daily.length < 50 || h1.length < 50) {
      return { ok: false, spec, error: `short history daily=${daily.length} h1=${h1.length}` };
    }
    return { ok: true, spec, daily, h1, h4: resample4h(h1), m15 };
  } catch (err) {
    return { ok: false, spec, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

async function publish(
  spec: Spec,
  plan: SymbolPlan,
  side: "long" | "short",
  clock: ReturnType<typeof londonClock>,
  trade: boolean,
): Promise<number> {
  const setup = side === "long" ? plan.long : plan.short;
  const paired = side === "long" ? plan.short : plan.long;
  const line = `${formatSetup(spec, setup, clock)} | paired ${paired.side.toUpperCase()} ${paired.grade}: ${paired.reason}`;
  await appendAlert(clock.date, line);
  console.log(line);
  await push(line, trade);
  return 1;
}

async function push(line: string, trade: boolean): Promise<void> {
  await pushNtfy(line);
  await sendTelegram(trade ? withHint(line) : `${line}\n\nResearch only. No order was sent.`);
}

async function pushNtfy(line: string): Promise<void> {
  const topic = process.env.NTFY_TOPIC?.trim() ?? "";
  if (!topic) return;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(topic)) {
    console.log("ntfy skipped: NTFY_TOPIC must be 1-64 letters, digits, _ or -");
    return;
  }
  try {
    const response = await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers: { Title: "daily-trade-scout", Tags: "chart" },
      body: line,
    });
    if (!response.ok) console.log(`ntfy failed: HTTP ${response.status}`);
  } catch {
    console.log("ntfy failed: request error");
  }
}

async function loadEnvFile(): Promise<void> {
  let text = "";
  try {
    text = await readFile(".env", "utf8");
  } catch {
    return;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
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

await main();
