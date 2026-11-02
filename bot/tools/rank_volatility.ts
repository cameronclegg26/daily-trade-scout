import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { SNAPSHOT_KEY, VOL_WINDOW, rankSnapshot, readSnapshot, sessionSnapshotKey } from "../lib/market.js";

export default defineTool({
  description: prompt`
    Rank the latest fetch_quotes snapshot by 20-session realized volatility.
    Call fetch_quotes first. Read-only. Do not invent a rank.
  `,
  inputSchema: z.object({
    window: z
      .number()
      .int()
      .min(5)
      .max(60)
      .optional()
      .describe("Trailing sessions of daily log returns. Default 20."),
  }),
  effect: "read",
  async execute({ window }, ctx) {
    const snapshot =
      readSnapshot(await ctx.host.kv.get(sessionSnapshotKey(ctx.session.id))) ??
      readSnapshot(await ctx.host.kv.get(SNAPSHOT_KEY));
    if (!snapshot) {
      return {
        researchOnly: true as const,
        ok: false as const,
        error: "No quote snapshot. Call fetch_quotes first.",
      };
    }
    const ranked = rankSnapshot(snapshot, window ?? VOL_WINDOW);
    return {
      researchOnly: true as const,
      ok: true as const,
      capturedAt: snapshot.capturedAt,
      ...ranked,
      note: "Research ranking only. Higher realizedVolPercent is more volatile. This does not place an order.",
    };
  },
});
