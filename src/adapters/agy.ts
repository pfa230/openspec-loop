#!/usr/bin/env node
// loop-agy: runs Antigravity headless and writes the structured output of its final result event as the reply,
// and that event's usage; Antigravity reports no cost. The prompt goes last as -p=<prompt>, because -p takes its value.
import { counters, fail, invocation, jsonLines, runHarness, usage, writeReply } from "./common.js";

interface Final {
  result?: { status?: string; structured_output?: unknown; usage?: unknown };
}

const lastResult = (stdout: string) => jsonLines(stdout).findLast((event) => (event as { event?: string }).event === "result") as Final | undefined;

const { args, prompt, schemaPath, replyPath, usagePath } = invocation();
const stdout = await runHarness("agy", ["--output-format", "stream-json", "--json-schema", schemaPath, ...args, `-p=${prompt}`], usagePath, (out) => {
  const final = lastResult(out);
  return final && usage(counters(final.result?.usage, ["input_tokens", "cache_read_tokens", "output_tokens", "thinking_tokens"]), undefined);
});
const final = lastResult(stdout);
if (final?.result?.status !== "SUCCESS") fail(`agy ended without a successful result (${final?.result?.status ?? "no result event"})`);
writeReply(replyPath, final.result.structured_output);
