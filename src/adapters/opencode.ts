#!/usr/bin/env node
// loop-opencode: runs OpenCode headless. OpenCode cannot enforce a schema, so the adapter asks for bare JSON
// and accepts only a final message that parses as one JSON object as a whole. OpenCode reports usage and cost
// per model step, so the usage is their sum over the steps.
import { counters, fail, invocation, jsonLines, runHarness, usage, writeReply } from "./common.js";

const { args, prompt, schema, replyPath, usagePath } = invocation();
const request = `${prompt}
Answer with exactly one JSON object that matches this JSON schema, and nothing else: no prose and no code fence.

${schema}`;
const stdout = await runHarness("opencode", ["run", "--format", "json", ...args, request], usagePath, (out) => {
  const tokens: Record<string, number> = {};
  let cost: number | undefined;
  for (const event of jsonLines(out) as { type?: string; part?: { tokens?: unknown; cost?: unknown } }[]) {
    if (event.type !== "step_finish") continue;
    for (const [name, count] of Object.entries(counters(event.part?.tokens, ["input", "cache.read", "cache.write", "output", "reasoning"]))) {
      tokens[name] = (tokens[name] ?? 0) + count;
    }
    if (typeof event.part?.cost === "number") cost = (cost ?? 0) + event.part.cost;
  }
  return usage(tokens, cost);
});
const text = jsonLines(stdout).findLast((event) => (event as { type?: string }).type === "text") as { part?: { text?: string } } | undefined;
if (typeof text?.part?.text !== "string") fail("opencode gave no final message");
let answer: unknown;
try {
  answer = JSON.parse(text.part.text.trim());
} catch {
  fail("opencode's final message is not one JSON object");
}
writeReply(replyPath, answer);
