// Dated brief path and the research-only footer every saved brief must carry.
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RESEARCH_ONLY_MARK = "does not place live orders";

export const RESEARCH_ONLY_SECTION = `## Research only

This brief is educational market research for the Sabio Trade prop account and a small Phantom-wallet crypto sleeve (BTC, SOL, and HYPE). This agent does not place live orders. It has no broker connection and it does not sign or send wallet transactions. Nothing in this brief is an instruction to trade.
`;

export function ensureDisclaimer(markdown: string): { markdown: string; appended: boolean } {
  const trimmed = markdown.trim();
  if (trimmed.toLowerCase().includes(RESEARCH_ONLY_MARK)) {
    return { markdown: `${trimmed}\n`, appended: false };
  }
  return { markdown: `${trimmed}\n\n${RESEARCH_ONLY_SECTION}`, appended: true };
}

export function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function briefRelativePath(date: string): string {
  assertDate(date);
  return `briefs/${date}.md`;
}

export function briefAbsolutePath(date: string): string {
  assertDate(date);
  return path.join(briefsDir(), `${date}.md`);
}

export function briefsDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../briefs");
}

function assertDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Brief date must be YYYY-MM-DD.");
  }
}
