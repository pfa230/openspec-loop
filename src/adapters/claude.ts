#!/usr/bin/env node
// loop-claude: runs Claude Code headless and writes the structured output of its final result as the reply.
import { fail, invocation, jsonLines, runHarness, writeReply } from "./common.js";

const { args, prompt, schema, replyPath } = invocation();
const stdout = await runHarness("claude", ["-p", "--output-format", "stream-json", "--verbose", "--json-schema", schema, ...args, "--", prompt]);
const result = jsonLines(stdout).findLast((event) => (event as { type?: string }).type === "result") as
  | { subtype?: string; structured_output?: unknown }
  | undefined;
if (result?.subtype !== "success") fail(`claude ended without a successful result (${result?.subtype ?? "no result event"})`);
writeReply(replyPath, result.structured_output);
