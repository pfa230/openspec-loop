#!/usr/bin/env node
// loop-codex: runs Codex headless; Codex writes its schema-conforming final message straight to the reply file.
import { existsSync } from "node:fs";
import { fail, invocation, runHarness } from "./common.js";

const { args, prompt, schemaPath, replyPath } = invocation();
await runHarness("codex", ["exec", "--json", "--output-schema", schemaPath, "-o", replyPath, ...args, "--", prompt]);
if (!existsSync(replyPath)) fail("codex wrote no final message");
