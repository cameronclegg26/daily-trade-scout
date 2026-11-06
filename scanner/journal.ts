// Local alert book. Tracks paper results so the risk rules can stop the day.
// Nothing here is sent to a broker.

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Setup } from "./rules.js";
import { DAY_LOSS_LIMIT, MAX_DAY_LOSSES, MAX_OPEN_RISK, RISK_DOLLARS, type Spec } from "./universe.js";
import type { Bar } from "./yahoo.js";

export type IdeaStatus = "pending" | "open" | "skipped" | "win" | "loss" | "scratch";

export type Idea = {
  key: string;
  symbol: string;
  side: "long" | "short";
  grade: "A+" | "A";
  entry: number;
  stop: number;
  r: number;
  half: number;
  target: number;
  level: string | null;
  openedAt: string;
  openedOn: string;
  /** pending: alert sent, no fill yet. skipped: user passed. armed: that signal has since died. */
  status: IdeaStatus;
  armed: boolean;
  partial: boolean;
  pnl: number;
};

export type Book = {
  date: string;
  dayPnl: number;
  losses: number;
  weekendNoted: boolean;
  telegramOffset: number;
  ideas: Idea[];
};

const STATE_PATH = path.resolve("scanner/state.json");
const ALERTS_DIR = path.resolve("alerts");

export function emptyBook(date: string): Book {
  return { date, dayPnl: 0, losses: 0, weekendNoted: false, telegramOffset: 0, ideas: [] };
}

export async function loadBook(date: string): Promise<Book> {
  try {
    const parsed = JSON.parse(await readFile(STATE_PATH, "utf8")) as Partial<Book>;
    const book: Book = {
      date: typeof parsed.date === "string" ? parsed.date : date,
      dayPnl: typeof parsed.dayPnl === "number" ? parsed.dayPnl : 0,
      losses: typeof parsed.losses === "number" ? parsed.losses : 0,
      weekendNoted: parsed.weekendNoted === true,
      telegramOffset: typeof parsed.telegramOffset === "number" ? parsed.telegramOffset : 0,
      ideas: Array.isArray(parsed.ideas) ? parsed.ideas.filter(isIdea).map(normalizeIdea) : [],
    };
    if (book.date !== date) {
      return {
        date,
        dayPnl: 0,
        losses: 0,
        weekendNoted: false,
        telegramOffset: book.telegramOffset,
        ideas: book.ideas.filter((idea) => idea.status === "open"),
      };
    }
    return book;
  } catch {
    return emptyBook(date);
  }
}

export async function saveBook(book: Book): Promise<void> {
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(book, null, 2)}\n`, "utf8");
}

export function openRisk(book: Book): number {
  return book.ideas.filter((idea) => (idea.status === "open" || idea.status === "pending") && !idea.partial).length * RISK_DOLLARS;
}

export function riskBlock(book: Book): string | null {
  if (book.losses >= MAX_DAY_LOSSES) return `${book.losses} losses, no new trades today`;
  if (book.dayPnl <= -DAY_LOSS_LIMIT) return `day pnl ${book.dayPnl}, no new trades today`;
  if (openRisk(book) + RISK_DOLLARS > MAX_OPEN_RISK) return `open risk would pass $${MAX_OPEN_RISK}`;
  return null;
}

export function directionFlip(book: Book, symbol: string, side: Idea["side"]): boolean {
  return book.ideas.some(
    (idea) =>
      idea.symbol === symbol &&
      idea.side !== side &&
      idea.openedOn === book.date &&
      idea.status !== "skipped",
  );
}

export function alreadyTracked(book: Book, key: string, symbol: string, side: Idea["side"]): boolean {
  return book.ideas.some((idea) => {
    const sameSide = idea.symbol === symbol && idea.side === side;
    if (!sameSide && idea.key !== key) return false;
    if (idea.status === "pending" || idea.status === "open") return true;
    return idea.status === "skipped" && !idea.armed && sameSide;
  });
}

export function ideaKey(setup: Setup, date: string): string {
  return `${date}|${setup.symbol}|${setup.side}|${setup.level ?? "level"}`;
}

export function trackIdea(book: Book, setup: Setup, openedAt: string): Idea {
  const idea: Idea = {
    key: ideaKey(setup, book.date),
    symbol: setup.symbol,
    side: setup.side,
    grade: setup.grade === "A+" ? "A+" : "A",
    entry: setup.entry,
    stop: setup.stop ?? setup.entry,
    r: setup.r ?? 0,
    half: setup.half ?? setup.entry,
    target: setup.target ?? setup.entry,
    level: setup.level,
    openedAt,
    openedOn: book.date,
    status: "pending",
    armed: false,
    partial: false,
    pnl: 0,
  };
  book.ideas.push(idea);
  return idea;
}

/** A skipped idea pings once the old signal has died and a fresh A or A+ is back. */
export function noteValidity(idea: Idea, live: boolean): "silent" | "ping" {
  if (idea.status !== "skipped") return "silent";
  if (!live) {
    idea.armed = true;
    return "silent";
  }
  if (!idea.armed) return "silent";
  return "ping";
}

export function rearmIdea(idea: Idea, setup: Setup, openedAt: string, date: string): void {
  idea.key = ideaKey(setup, date);
  idea.grade = setup.grade === "A+" ? "A+" : "A";
  idea.entry = setup.entry;
  idea.stop = setup.stop ?? setup.entry;
  idea.r = setup.r ?? 0;
  idea.half = setup.half ?? setup.entry;
  idea.target = setup.target ?? setup.entry;
  idea.level = setup.level;
  idea.openedAt = openedAt;
  idea.openedOn = date;
  idea.status = "pending";
  idea.armed = false;
  idea.partial = false;
  idea.pnl = 0;
}

export type ReplyAction = "skip" | "placed" | "when";

export type ReplyResult =
  | { kind: "none"; symbol?: string }
  | { kind: "skip"; idea: Idea }
  | { kind: "already-skipped"; idea: Idea }
  | { kind: "placed"; idea: Idea }
  | { kind: "already-open"; idea: Idea }
  | { kind: "closed"; idea: Idea }
  | { kind: "when"; idea: Idea | null };

export function applyReply(book: Book, action: ReplyAction, symbol: string | undefined, nowIso: string): ReplyResult {
  const idea = pickIdea(book, symbol);
  if (action === "when") return { kind: "when", idea };
  if (!idea) return { kind: "none", symbol };
  if (idea.status === "win" || idea.status === "loss" || idea.status === "scratch") return { kind: "closed", idea };
  if (action === "skip") {
    if (idea.status === "skipped") return { kind: "already-skipped", idea };
    if (idea.status === "open" && (idea.partial || idea.pnl !== 0)) return { kind: "closed", idea };
    idea.status = "skipped";
    idea.armed = false;
    return { kind: "skip", idea };
  }
  if (idea.status === "open") return { kind: "already-open", idea };
  idea.status = "open";
  idea.armed = false;
  idea.openedAt = nowIso;
  return { kind: "placed", idea };
}

export function pickIdea(book: Book, symbol: string | undefined): Idea | null {
  const rows = book.ideas.filter(
    (idea) =>
      (idea.status === "pending" || idea.status === "skipped" || idea.status === "open") &&
      (symbol == null || idea.symbol === symbol),
  );
  rows.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
  return rows[0] ?? null;
}

/** Update open ideas from bars since they were opened. Returns lesson lines. */
export function markToMarket(book: Book, spec: Spec, bars: readonly Bar[]): string[] {
  const lessons: string[] = [];
  for (const idea of book.ideas) {
    if (idea.symbol !== spec.id || idea.status !== "open") continue;
    const since = Date.parse(idea.openedAt);
    const relevant = bars.filter((bar) => bar.time >= since);
    if (relevant.length === 0) continue;
    const high = Math.max(...relevant.map((bar) => bar.high));
    const low = Math.min(...relevant.map((bar) => bar.low));
    const hitStop = idea.side === "long" ? low <= idea.stop : high >= idea.stop;
    const hitHalf = idea.side === "long" ? high >= idea.half : low <= idea.half;
    const hitTarget = idea.side === "long" ? high >= idea.target : low <= idea.target;
    if (!idea.partial && hitStop) {
      idea.status = "loss";
      idea.pnl = -RISK_DOLLARS;
      book.losses += 1;
      book.dayPnl += idea.pnl;
      lessons.push(`${idea.symbol} ${idea.side} loss ${idea.pnl}. The stop level was wrong.`);
      continue;
    }
    if (!idea.partial && hitHalf) {
      idea.partial = true;
      idea.stop = idea.entry;
      lessons.push(`${idea.symbol} ${idea.side} half off, stop moved to entry. Do not widen it.`);
    }
    if (idea.partial && hitStop && idea.status === "open") {
      idea.status = "scratch";
      idea.pnl = RISK_DOLLARS / 2;
      book.dayPnl += idea.pnl;
      lessons.push(`${idea.symbol} ${idea.side} scratch ${idea.pnl} after the partial. Stop was at entry.`);
      continue;
    }
    if (idea.partial && hitTarget) {
      idea.status = "win";
      idea.pnl = RISK_DOLLARS * 1.5;
      book.dayPnl += idea.pnl;
      lessons.push(`${idea.symbol} ${idea.side} win ${idea.pnl}. Half at 1R, rest at 2R.`);
    }
  }
  return lessons;
}

export function flattenForWeekend(book: Book): string[] {
  if (book.weekendNoted) return [];
  const lessons: string[] = [];
  for (const idea of book.ideas) {
    if (idea.status !== "open") continue;
    idea.status = "scratch";
    lessons.push(`close ${idea.symbol} ${idea.side} before the weekend. Outcome after the close is not a new trade.`);
  }
  book.weekendNoted = true;
  return lessons;
}

export async function appendAlert(date: string, line: string): Promise<void> {
  await mkdir(ALERTS_DIR, { recursive: true });
  const file = path.join(ALERTS_DIR, `${date}.md`);
  let header = "";
  try {
    await readFile(file, "utf8");
  } catch {
    header = [
      `# Alerts ${date} (Europe/London)`,
      "",
      "Research only. This scanner does not place live orders. It has no broker connection and it does not sign or send wallet transactions.",
      "",
    ].join("\n");
  }
  await appendFile(file, `${header}${line}\n`, "utf8");
}

const STATUSES: readonly IdeaStatus[] = ["pending", "open", "skipped", "win", "loss", "scratch"];

function isIdea(value: unknown): value is Idea {
  if (!value || typeof value !== "object") return false;
  const idea = value as Partial<Idea>;
  return typeof idea.key === "string" && typeof idea.symbol === "string" && (idea.side === "long" || idea.side === "short");
}

function normalizeIdea(idea: Idea): Idea {
  const status = STATUSES.includes(idea.status) ? idea.status : "open";
  return {
    ...idea,
    status,
    level: typeof idea.level === "string" ? idea.level : null,
    armed: idea.armed === true,
    partial: idea.partial === true,
    pnl: typeof idea.pnl === "number" ? idea.pnl : 0,
  };
}
