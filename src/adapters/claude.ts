#!/usr/bin/env node
// loop-claude: runs Claude Code headless and writes the structured output of its final result as the reply,
// and that result's usage and cost.
import { fail, invocation, jsonLines, runHarness, total, usage, writeReply } from "./common.js";

interface Result {
  type?: string;
  subtype?: string;
  structured_output?: unknown;
  usage?: { input_tokens?: unknown; cache_creation_input_tokens?: unknown; cache_read_input_tokens?: unknown; output_tokens?: unknown };
  total_cost_usd?: unknown;
}

const lastResult = (stdout: string) => jsonLines(stdout).findLast((event) => (event as Result).type === "result") as Result | undefined;

const { args, prompt, schema, replyPath, usagePath } = invocation();
const stdout = await runHarness("claude", ["-p", "--output-format", "stream-json", "--verbose", "--json-schema", schema, ...args, "--", prompt], usagePath, (out) => {
  const result = lastResult(out);
  const native = result?.usage;
  return result && usage(total(native?.input_tokens, native?.cache_creation_input_tokens, native?.cache_read_input_tokens), total(native?.output_tokens), total(result.total_cost_usd));
});
const result = lastResult(stdout);
if (result?.subtype !== "success") fail(`claude ended without a successful result (${result?.subtype ?? "no result event"})`);
writeReply(replyPath, result.structured_output);
