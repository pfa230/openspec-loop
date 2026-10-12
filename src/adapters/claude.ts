#!/usr/bin/env node
// loop-claude: runs Claude Code headless and writes the structured output of its final result as the reply,
// and that result's usage and cost.
import { counters, fail, invocation, jsonLines, runHarness, usage, writeReply } from "./common.js";

interface Result {
  type?: string;
  subtype?: string;
  structured_output?: unknown;
  usage?: unknown;
  total_cost_usd?: unknown;
}

const lastResult = (stdout: string) => jsonLines(stdout).findLast((event) => (event as Result).type === "result") as Result | undefined;

const { args, prompt, schema, replyPath, usagePath } = invocation();
const stdout = await runHarness("claude", ["-p", "--output-format", "stream-json", "--verbose", "--json-schema", schema, ...args, "--", prompt], usagePath, (out) => {
  const result = lastResult(out);
  return result && usage(counters(result.usage), result.total_cost_usd);
});
const result = lastResult(stdout);
if (result?.subtype !== "success") fail(`claude ended without a successful result (${result?.subtype ?? "no result event"})`);
writeReply(replyPath, result.structured_output);
