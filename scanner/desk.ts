// Phone replies for the rules scanner. Fixed phrases only. Message text is untrusted.

import { timingBlock, type LondonClock } from "./clock.js";
import type { Idea, ReplyAction, ReplyResult } from "./journal.js";
import { WATCHLIST } from "./universe.js";

export const REPLY_HINT = "Reply not placed, placed, or when. Research only. No order was sent.";

export type DeskReply = {
  action: ReplyAction;
  symbol?: string;
};

export function parseDeskReply(text: string): DeskReply | null {
  const skip =
    /\b(not placed|haven'?t placed|didn'?t place|did not place|didn'?t enter|did not enter|no entry|no fill|not in|skip|pass)\b/i.test(
      text,
    );
  const placed = /\b(placed|filled|entered|taken|i am in|i'm in|im in)\b/i.test(text);
  const when = /\b(when|status)\b/i.test(text);
  const action: ReplyAction | null = skip ? "skip" : placed ? "placed" : when ? "when" : null;
  if (!action) return null;
  return { action, symbol: findSymbol(text) };
}

export function replyText(result: ReplyResult, clock: LondonClock): string {
  if (result.kind === "none") {
    const which = result.symbol ? `${result.symbol} is not waiting.` : "Nothing is waiting.";
    return `${which} At ${clock.label} UK I will message the next A or A+ setup. ${REPLY_HINT}`;
  }
  if (result.kind === "when") return whenText(result.idea, clock);
  if (result.kind === "skip" || result.kind === "already-skipped") {
    return `${name(result.idea)} is not on the book. I will message you when that side is a fresh A or A+ again.${level(result.idea)} ${REPLY_HINT}`;
  }
  if (result.kind === "placed") {
    return `${name(result.idea)} is marked open from ${result.idea.entry}. Stop ${result.idea.stop}. I will message a stop, a half, or 2R. ${REPLY_HINT}`;
  }
  if (result.kind === "already-open") {
    return `${name(result.idea)} is already marked open from ${result.idea.entry}. Stop stays ${result.idea.stop}. ${REPLY_HINT}`;
  }
  return `${name(result.idea)} is already closed (${result.idea.status}). The day book is unchanged. ${REPLY_HINT}`;
}

export function withHint(line: string): string {
  return `${line}\n\n${REPLY_HINT}`;
}

function whenText(idea: Idea | null, clock: LondonClock): string {
  const pause = nextPause(clock);
  if (!idea) {
    return `Nothing is waiting at ${clock.label} UK. ${pause}. I will message the next A or A+ setup. ${REPLY_HINT}`;
  }
  const state =
    idea.status === "skipped"
      ? idea.armed
        ? `${name(idea)} has reset. I message when daily, 4h, and 1h agree and price is back at a level.`
        : `${name(idea)} is the same signal you passed. I message again only after that signal dies and sets up again.`
      : idea.status === "pending"
        ? `${name(idea)} is still the alert I sent at ${idea.entry}. Stop ${idea.stop}. You have not confirmed an entry.`
        : idea.status === "open"
          ? `${name(idea)} is marked open from ${idea.entry}. Stop ${idea.stop}.`
          : `${name(idea)} is closed (${idea.status}).`;
  return `${state}${level(idea)} ${pause}. ${REPLY_HINT}`;
}

function nextPause(clock: LondonClock): string {
  const blocked = timingBlock(clock);
  if (blocked) return `Entries are blocked now: ${blocked}`;
  const mins = clock.hour * 60 + clock.minute;
  if (mins < 13 * 60 + 15) return "Next pause is 13:15–13:45 UK for US data";
  if (mins < 14 * 60 + 15) return "Next pause is 14:15–15:15 UK for the US open";
  if (clock.weekday === 5 && mins < 20 * 60) return "Next pause is 20:00 UK, then the desk flattens for the weekend";
  return "No more entry pause today";
}

function name(idea: Idea): string {
  return `${idea.symbol} ${idea.side}`;
}

function level(idea: Idea): string {
  return idea.level ? ` Level ${idea.level}.` : "";
}

function findSymbol(text: string): string | undefined {
  const upper = text.toUpperCase();
  const ids = WATCHLIST.map((spec) => spec.id).sort((a, b) => b.length - a.length);
  for (const id of ids) {
    if (new RegExp(`\\b${id}\\b`).test(upper)) return id;
  }
  return undefined;
}
