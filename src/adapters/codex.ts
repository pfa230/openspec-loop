#!/usr/bin/env node
// loop-codex: runs Codex headless; Codex writes its schema-conforming final message straight to the reply file.
// The usage is that of its last completed turn; the exec output has no reported USD cost.
import { existsSync } from "node:fs";
import { fail, invocation, jsonLines, runHarness, total, usage } from "./common.js";

const { args, prompt, schemaPath, replyPath, usagePath } = invocation();
await runHarness("codex", ["exec", "--json", "--output-schema", schemaPath, "-o", replyPath, ...args, "--", prompt], usagePath, (out) => {
  const turn = jsonLines(out).findLast((event) => (event as { type?: string }).type === "turn.completed") as { usage?: { input_tokens?: unknown; output_tokens?: unknown } } | undefined;
  return turn && usage(total(turn.usage?.input_tokens), total(turn.usage?.output_tokens), undefined);
});
if (!existsSync(replyPath)) fail("codex wrote no final message");
