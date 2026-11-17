// Crypto-scanner helpers. Research only. No orders.
// Volume confirmation is not applied. That code is only on the open
// volume-confirmation branch, not on main. Lines match the main scanner.

import path from "node:path";
import { minutesOfDay, type LondonClock } from "./clock.js";
import { formatSetup, type Setup } from "./rules.js";
import type { Spec } from "./universe.js";

export const CRYPTO_ALERTS_DIR = path.resolve("alerts-crypto");
export const CRYPTO_STATE_PATH = path.resolve("scanner/state-crypto.json");
export const WATCH_ONLY_TAG = "WATCH ONLY (before 15:15 UK rule)";

const ENTRY_MINUTES = 15 * 60 + 15;

/** Before 15:15 UK the line is a watch. The user does not enter yet. */
export function cryptoWatchTag(clock: LondonClock): string | null {
  return minutesOfDay(clock) < ENTRY_MINUTES ? WATCH_ONLY_TAG : null;
}

export function cryptoCanAlert(setup: Setup): boolean {
  return setup.grade === "A" || setup.grade === "A+";
}

export function formatCryptoAlert(spec: Spec, setup: Setup, paired: Setup, clock: LondonClock): string {
  const line = `${formatSetup(spec, setup, clock)} | paired ${paired.side.toUpperCase()} ${paired.grade}: ${paired.reason}`;
  const tag = cryptoWatchTag(clock);
  return tag ? `${line} | ${tag}` : line;
}
