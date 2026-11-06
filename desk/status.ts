// Last scanner pass, from the paper log the scanner already writes.
// Read only. This desk does not update the log and does not place orders.

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { londonClock } from "../scanner/clock.js";

export type ScanNote = {
  lastScanAt: string | null;
  summary: string;
};

export async function readScanNote(root: string, now: Date): Promise<ScanNote> {
  const file = path.join(root, "scanner", "state.json");
  try {
    const [text, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
    const parsed = JSON.parse(text) as { date?: unknown; losses?: unknown; dayPnl?: unknown };
    const stamp = londonClock(info.mtime);
    const today = londonClock(now).date;
    const fresh = parsed.date === today;
    const losses = fresh && typeof parsed.losses === "number" ? parsed.losses : null;
    const dayPnl = fresh && typeof parsed.dayPnl === "number" ? parsed.dayPnl : null;
    const bits = [`Last scan ${stamp.date} ${stamp.label} UK`];
    if (losses != null) bits.push(`paper log ${losses} ${losses === 1 ? "loss" : "losses"}`);
    if (dayPnl != null) bits.push(`day pnl ${dayPnl}`);
    if (losses != null && losses >= 2) bits.push("scanner will not add new alerts today");
    return {
      lastScanAt: info.mtime.toISOString(),
      summary: `${bits.join(" · ")}. Research and alerts only. Nothing is sent.`,
    };
  } catch {
    return {
      lastScanAt: null,
      summary: "No scan recorded yet. Research and alerts only. Nothing is sent.",
    };
  }
}
