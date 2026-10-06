#!/usr/bin/env node
// loop-codex: runs Codex headless; Codex writes its schema-conforming final message straight to the reply file.
// The usage is that of its last completed turn; Codex reports no cost.
import { existsSync } from "node:fs";
import { counters, fail, invocation, jsonLines, runHarness, usage } from "./common.js";

const { args, prompt, schemaPath, replyPath, usagePath } = invocation();
await runHarness("codex", ["exec", "--json", "--output-schema", schemaPath, "-o", replyPath, ...args, "--", prompt], usagePath, (out) => {
  const turn = jsonLines(out).findLast((event) => (event as { type?: string }).type === "turn.completed") as { usage?: unknown } | undefined;
  return turn && usage(counters(turn.usage, ["input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens"]), undefined);
});
if (!existsSync(replyPath)) fail("codex wrote no final message");
