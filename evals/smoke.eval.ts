import { defineEval, includes } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "A research check loads quotes, ranks volatility, and does not save a brief.",
  async test(t) {
    await t.send(
      "Run a short research check. Fetch quotes, rank volatility, and say whether any order was placed. Do not save a brief.",
    );
    t.succeeded();
    t.calledTool("fetch_quotes");
    t.calledTool("rank_volatility");
    t.notCalledTool("save_daily_brief");
    t.check(t.reply, includes(/does not place live orders|no live order|did not place|no order/i));
  },
});
