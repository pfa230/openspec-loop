#!/usr/bin/env node
// loop-opencode: runs OpenCode headless. OpenCode cannot enforce a schema, so the adapter asks for bare JSON
// and accepts only a final message that parses as one JSON object as a whole.
import { fail, invocation, jsonLines, runHarness, writeReply } from "./common.js";

const { args, prompt, schema, replyPath } = invocation();
const request = `${prompt}
Answer with exactly one JSON object that matches this JSON schema, and nothing else: no prose and no code fence.

${schema}`;
const stdout = await runHarness("opencode", ["run", "--format", "json", ...args, request]);
const text = jsonLines(stdout).findLast((event) => (event as { type?: string }).type === "text") as { part?: { text?: string } } | undefined;
if (typeof text?.part?.text !== "string") fail("opencode gave no final message");
let answer: unknown;
try {
  answer = JSON.parse(text.part.text.trim());
} catch {
  fail("opencode's final message is not one JSON object");
}
writeReply(replyPath, answer);
