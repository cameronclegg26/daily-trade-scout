// Crypto-only rules scanner. Research only.
// No broker, no exchange, no wallet, no API key, no orders.
// Prices are Yahoo Finance charts, the same free source as scanner/scan.ts:
// BTC-USD, ETH-USD, SOL-USD, XRP-USD, ZEC-USD.

import { readFile } from "node:fs/promises";
import { londonClock } from "./clock.js";
import { CRYPTO_ALERTS_DIR, CRYPTO_STATE_PATH, cryptoCanAlert, cryptoWatchTag, formatCryptoAlert } from "./crypto.js";
import {
  alreadyTracked,
  alreadyWatched,
  appendAlert,
  directionFlip,
  ideaKey,
  loadBook,
  markToMarket,
  openRisk,
  riskBlock,
  saveBook,
  trackIdea,
  trackWatch,
} from "./journal.js";
import { evaluateSymbol } from "./rules.js";
import { CRYPTO_WATCHLIST, type Spec } from "./universe.js";
import { fetchBars, resample4h, type Bar } from "./yahoo.js";

const LOOP_MS = 15 * 60 * 1000;

type Pack =
  | { ok: true; spec: Spec; daily: Bar[]; h1: Bar[]; h4: Bar[]; m15: Bar[] }
  | { ok: false; spec: Spec; error: string };

async function main(): Promise<void> {
  const loop = process.argv.includes("--loop");
  console.log("Crypto scanner. Research only. No broker, no exchange, no wallet, no orders.");
  do {
    try {
      await scanOnce();
    } catch (err) {
      console.error(err instanceof Error ? err.message : "crypto scan failed");
    }
    if (!loop) break;
    await new Promise((resolve) => setTimeout(resolve, LOOP_MS));
  } while (loop);
}

async function scanOnce(): Promise<void> {
  await loadEnvFile();
  const now = new Date();
  const clock = londonClock(now);
  const book = await loadBook(clock.date, CRYPTO_STATE_PATH);
  const packs = await mapPool(CRYPTO_WATCHLIST, 3, loadPack);
  const lessons: string[] = [];
  for (const pack of packs) {
    if (!pack.ok) continue;
    lessons.push(...markToMarket(book, pack.spec, pack.m15));
  }

  const ctx = {
    now,
    clock,
    oilChangePercent: null,
    us500ChangePercent: null,
    hotUsData: false,
    qqqEarningsMiss: false,
  };

  let alerts = 0;
  for (const pack of packs) {
    if (!pack.ok) {
      console.log(`${clock.label} UK | ${pack.spec.id} | data error | ${pack.error}`);
      continue;
    }
    const plan = evaluateSymbol(pack.spec, pack.daily, pack.h1, pack.h4, pack.m15, ctx);
    for (const setup of [plan.long, plan.short]) {
      if (!cryptoCanAlert(setup)) continue;
      if (setup.stop == null || setup.r == null) continue;
      const key = ideaKey(setup, book.date);
      const paired = setup.side === "long" ? plan.short : plan.long;
      const watch = cryptoWatchTag(clock);
      if (watch) {
        if (alreadyWatched(book, key) || alreadyTracked(book, key, setup.symbol, setup.side)) continue;
        const line = formatCryptoAlert(pack.spec, setup, paired, clock);
        await appendAlert(clock.date, line, CRYPTO_ALERTS_DIR);
        console.log(line);
        await push(line);
        trackWatch(book, key);
        alerts += 1;
        continue;
      }
      if (riskBlock(book)) continue;
      if (directionFlip(book, setup.symbol, setup.side)) continue;
      if (alreadyTracked(book, key, setup.symbol, setup.side)) continue;
      const line = formatCryptoAlert(pack.spec, setup, paired, clock);
      await appendAlert(clock.date, line, CRYPTO_ALERTS_DIR);
      console.log(line);
      await push(line);
      trackIdea(book, setup, now.toISOString());
      alerts += 1;
    }
  }

  for (const lesson of lessons) {
    const line = `${clock.label} UK | LESSON | ${lesson}`;
    await appendAlert(clock.date, line, CRYPTO_ALERTS_DIR);
    console.log(line);
    await push(line);
  }
  await saveBook(book, CRYPTO_STATE_PATH);
  const watch = cryptoWatchTag(clock);
  const blocked = riskBlock(book);
  const note = [watch, blocked].filter((item) => item).join(" | ");
  console.log(
    `${clock.date} ${clock.label} UK | crypto scanned ${CRYPTO_WATCHLIST.length} | alerts ${alerts} | day pnl ${book.dayPnl} | losses ${book.losses} | open risk ${openRisk(book)}${note ? ` | ${note}` : ""} | alerts only, no orders`,
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

async function push(line: string): Promise<void> {
  const topic = process.env.NTFY_TOPIC?.trim() ?? "";
  if (!topic) return;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(topic)) {
    console.log("ntfy skipped: NTFY_TOPIC must be 1-64 letters, digits, _ or -");
    return;
  }
  try {
    const response = await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers: { Title: "Crypto Scanner", Tags: "chart" },
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
