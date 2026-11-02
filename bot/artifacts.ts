import { defineArtifacts } from "@grok/agent-sdk/artifacts";
import * as z from "zod/v4";

export default defineArtifacts({
  kinds: {
    "daily-brief": {
      description: "A dated educational research brief. It never records an order.",
      schema: z.object({
        date: z.string(),
        path: z.string(),
        researchOnly: z.literal(true),
      }),
    },
  },
});
