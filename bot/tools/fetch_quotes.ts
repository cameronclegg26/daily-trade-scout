import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { SNAPSHOT_KEY, fetchQuotes, knownIds, publicQuotes, sessionSnapshotKey } from "../lib/market.js";

export default defineTool({
  description: prompt`
    Fetch the desk quote snapshot, including the strategy watchlist
    (gold, US500, US30, QQQ, GBPUSD, EURUSD, USDJPY, WTI, BTC, ETH, SOL, ZEC).
    Stores daily closes for rank_volatility. Read-only. Never places an order.
  `,
  inputSchema: z.object({
    ids: z
      .array(z.string().min(1).max(24))
      .max(32)
      .optional()
      .describe("Instrument ids. Omit this to load the full universe."),
  }),
  effect: "read",
  async execute({ ids }, ctx) {
    const loaded = await fetchQuotes(ids, ctx.now());
    if (!loaded.ok) {
      return { researchOnly: true as const, ok: false as const, error: loaded.error, knownIds: knownIds() };
    }
    const stored = JSON.parse(JSON.stringify(loaded.snapshot));
    await ctx.host.kv.put(sessionSnapshotKey(ctx.session.id), stored);
    await ctx.host.kv.put(SNAPSHOT_KEY, stored);
    const quotes = publicQuotes(loaded.snapshot);
    return {
      researchOnly: true as const,
      ok: true as const,
      capturedAt: loaded.snapshot.capturedAt,
      snapshotKey: SNAPSHOT_KEY,
      priced: quotes.filter((quote) => quote.last != null).length,
      failed: quotes.filter((quote) => quote.last == null).length,
      instruments: quotes,
      note: "Closes are stored for rank_volatility. This tool does not place orders.",
    };
  },
});
