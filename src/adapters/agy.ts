#!/usr/bin/env node
// loop-agy: runs Antigravity headless and writes the structured output of its final result event as the reply.
// The prompt goes last as -p=<prompt>, because -p takes its value.
import { fail, invocation, jsonLines, runHarness, writeReply } from "./common.js";

const { args, prompt, schemaPath, replyPath } = invocation();
const stdout = await runHarness("agy", ["--output-format", "stream-json", "--json-schema", schemaPath, ...args, `-p=${prompt}`]);
const final = jsonLines(stdout).findLast((event) => (event as { event?: string }).event === "result") as
  | { result?: { status?: string; structured_output?: unknown } }
  | undefined;
if (final?.result?.status !== "SUCCESS") fail(`agy ended without a successful result (${final?.result?.status ?? "no result event"})`);
writeReply(replyPath, final.result.structured_output);
