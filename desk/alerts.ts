// Read today's A and A+ lines from alerts/YYYY-MM-DD.md. Research only.

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { londonClock } from "../scanner/clock.js";

export type DeskIdea = {
  time: string;
  grade: "A" | "A+";
  side: "long" | "short";
  symbol: string;
  entry: string;
  stop: string;
  half: string;
  target: string;
  size: string;
  level: string;
  trigger: string;
  volumeLine: string;
  reason: string;
  paired: string | null;
};

export type TodayAlerts = {
  date: string;
  file: string;
  found: boolean;
  updatedLabel: string | null;
  ideas: DeskIdea[];
};

export function parseAlertLines(text: string): DeskIdea[] {
  const ideas: DeskIdea[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const idea = parseAlertLine(raw);
    if (idea) ideas.push(idea);
  }
  return ideas;
}

export function parseAlertLine(raw: string): DeskIdea | null {
  const parts = raw.trim().split(" | ").map((part) => part.trim());
  if (parts.length < 12) return null;
  const time = /^(\d{2}:\d{2}) UK$/.exec(parts[0] ?? "");
  if (!time?.[1]) return null;
  const grade = parts[1];
  if (grade !== "A" && grade !== "A+") return null;
  const sideSym = /^(LONG|SHORT) ([A-Z0-9]+)$/.exec(parts[2] ?? "");
  if (!sideSym?.[1] || !sideSym[2]) return null;
  const entry = strip(parts[3], "entry ");
  const stop = strip(parts[4], "stop ");
  const half = strip(parts[5], "half ");
  const target = strip(parts[6], "2R ");
  const size = strip(parts[7], "size ");
  if (entry == null || stop == null || half == null || target == null || size == null) return null;
  const volumeLine = parts[10] ?? "";
  if (!volumeLine.startsWith("Volume:")) return null;
  const pairedRaw = parts.slice(12).join(" | ");
  return {
    time: time[1],
    grade,
    side: sideSym[1] === "LONG" ? "long" : "short",
    symbol: sideSym[2],
    entry,
    stop,
    half,
    target,
    size,
    level: parts[8] || "-",
    trigger: parts[9] || "-",
    volumeLine,
    reason: parts[11] ?? "",
    paired: pairedRaw.startsWith("paired ") ? pairedRaw.slice("paired ".length) : null,
  };
}

export async function readTodayAlerts(root: string, now: Date): Promise<TodayAlerts> {
  const date = londonClock(now).date;
  const file = `alerts/${date}.md`;
  const full = path.join(root, "alerts", `${date}.md`);
  try {
    const [text, info] = await Promise.all([readFile(full, "utf8"), stat(full)]);
    const stamp = londonClock(info.mtime);
    return {
      date,
      file,
      found: true,
      updatedLabel: `${stamp.date} ${stamp.label} UK`,
      ideas: parseAlertLines(text),
    };
  } catch {
    return { date, file, found: false, updatedLabel: null, ideas: [] };
  }
}

function strip(value: string | undefined, prefix: string): string | null {
  if (!value?.startsWith(prefix)) return null;
  return value.slice(prefix.length);
}
