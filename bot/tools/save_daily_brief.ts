import { mkdir, writeFile } from "node:fs/promises";
import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import {
  briefAbsolutePath,
  briefRelativePath,
  briefsDir,
  ensureDisclaimer,
  utcDate,
} from "../lib/brief.js";

export default defineTool({
  description: prompt`
    Save the dated research brief as markdown under briefs/.
    Overwrites the same UTC date. Appends the research-only footer when it is missing.
    Writes a file only. Never places an order and never touches a broker or wallet.
  `,
  inputSchema: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("UTC date YYYY-MM-DD. Defaults to the session clock."),
    title: z.string().min(1).max(160).optional(),
    markdown: z.string().min(40).max(80_000),
  }),
  effect: "idempotent",
  dryRunResult: ({ date }) => ({
    researchOnly: true as const,
    saved: false as const,
    dryRun: true as const,
    date: date ?? "session-date",
  }),
  async execute({ date, title, markdown }, ctx) {
    const resolvedDate = date ?? utcDate(ctx.now());
    const body = ensureDisclaimer(markdown);
    const relativePath = briefRelativePath(resolvedDate);
    const repoWrite = await writeRepoFile(resolvedDate, body.markdown);
    let hostFile: { ok: true; path: string } | { ok: false; error: string };
    try {
      await ctx.host.files.write(relativePath, body.markdown, { scope: { kind: "deployment" } });
      hostFile = { ok: true, path: relativePath };
    } catch (err) {
      hostFile = { ok: false, error: err instanceof Error ? err.message : "Could not store the host file." };
    }
    let artifact: { ok: true; id: string } | { ok: false; error: string };
    try {
      const record = await ctx.artifacts.tag({
        kind: "daily-brief",
        key: `daily-brief:${resolvedDate}`,
        title: title ?? `Daily trade scout ${resolvedDate}`,
        data: JSON.parse(JSON.stringify({ date: resolvedDate, path: relativePath, researchOnly: true })),
        contents: body.markdown,
        contentType: "text/markdown",
      });
      artifact = { ok: true, id: record.id };
    } catch (err) {
      artifact = { ok: false, error: err instanceof Error ? err.message : "Could not tag the brief." };
    }
    return {
      researchOnly: true as const,
      saved: repoWrite.ok || hostFile.ok,
      date: resolvedDate,
      path: relativePath,
      disclaimerAppended: body.appended,
      repoWrite,
      hostFile,
      artifact,
      note: "Markdown only. No order was sent. This agent has no broker or wallet execution.",
    };
  },
});

async function writeRepoFile(
  date: string,
  markdown: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    await mkdir(briefsDir(), { recursive: true });
    await writeFile(briefAbsolutePath(date), markdown, "utf8");
    return { ok: true, path: briefRelativePath(date) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not write the brief." };
  }
}
