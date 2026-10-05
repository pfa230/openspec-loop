import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const recording = (name: string) => fileURLToPath(new URL(`test/recordings/${name}`, root));
const REPLY = { findings: [{ severity: "blocking", location: "design.md", problem: "the design is missing", question: null }] };

// A stub harness: logs its arguments, prints a recorded stream, writes the recorded answer after -o
// when given one, and exits with a chosen status.
const STUB = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.writeFileSync(process.env.STUB_LOG, JSON.stringify(args));
if (process.env.STUB_STREAM) process.stdout.write(fs.readFileSync(process.env.STUB_STREAM));
const out = args.indexOf("-o");
if (out >= 0 && process.env.STUB_ANSWER) fs.writeFileSync(args[out + 1], fs.readFileSync(process.env.STUB_ANSWER));
process.exit(Number(process.env.STUB_EXIT || 0));
`;

interface Outcome {
  status: number | null;
  stderr: string;
  args: string[];
  reply: unknown;
}

function adapter(t: { after: (fn: () => void) => void }, harness: string, env: Record<string, string>, args: string[] = []): Outcome {
  const dir = mkdtempSync(join(tmpdir(), "loop-adapter-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, harness), STUB);
  chmodSync(join(dir, harness), 0o755);
  writeFileSync(join(dir, "prompt.md"), "Review the plan.\n");
  writeFileSync(join(dir, "schema.json"), '{"type":"object"}\n');
  const reply = join(dir, "reply.json");
  const bin = fileURLToPath(new URL(`dist/src/adapters/${harness}.js`, root));
  const result = spawnSync(process.execPath, [bin, ...args, join(dir, "prompt.md"), join(dir, "schema.json"), reply], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}`, STUB_LOG: join(dir, "args.json"), ...env },
  });
  return {
    status: result.status,
    stderr: result.stderr,
    args: existsSync(join(dir, "args.json")) ? JSON.parse(readFileSync(join(dir, "args.json"), "utf8")) : [],
    reply: existsSync(reply) ? JSON.parse(readFileSync(reply, "utf8")) : undefined,
  };
}

function textStream(dir: string, text: string): string {
  const path = join(dir, "stream.jsonl");
  writeFileSync(path, `${JSON.stringify({ type: "step_start" })}\n${JSON.stringify({ type: "text", part: { type: "text", text } })}\n`);
  return path;
}

const cases = {
  claude: {
    args: ["-p", "--output-format", "stream-json", "--verbose", "--json-schema", '{"type":"object"}\n', "--model", "opus", "--", "Review the plan.\n"],
    env: { STUB_STREAM: recording("claude.jsonl") },
  },
  codex: {
    args: ["exec", "--json", "--output-schema", "<schema>", "-o", "<reply>", "--model", "opus", "--", "Review the plan.\n"],
    env: { STUB_STREAM: recording("codex.jsonl"), STUB_ANSWER: recording("codex.reply.json") },
  },
  agy: {
    args: ["--output-format", "stream-json", "--json-schema", "<schema>", "--model", "opus", "-p=Review the plan.\n"],
    env: { STUB_STREAM: recording("agy.jsonl") },
  },
  opencode: {
    args: ["run", "--format", "json", "--model", "opus", "<request>"],
    env: { STUB_STREAM: recording("opencode.jsonl") },
  },
};

for (const [harness, { args, env }] of Object.entries(cases)) {
  test(`loop-${harness} runs ${harness} with the agent's arguments and writes the recorded answer`, (t) => {
    const outcome = adapter(t, harness, env, ["--model", "opus"]);
    assert.equal(outcome.status, 0, outcome.stderr);
    const actual = outcome.args.map((arg) =>
      arg.endsWith("schema.json") ? "<schema>" : arg.endsWith("reply.json") ? "<reply>" : arg.startsWith("Review the plan.\n\nAnswer with") ? "<request>" : arg,
    );
    assert.deepEqual(actual, args);
    assert.deepEqual(outcome.reply, REPLY);
  });

  test(`loop-${harness} exits with the harness's status when it fails`, (t) => {
    const outcome = adapter(t, harness, { ...env, STUB_EXIT: "5" });
    assert.equal(outcome.status, 5);
    assert.match(outcome.stderr, new RegExp(`${harness} exited with status 5`));
    if (harness !== "codex") assert.equal(outcome.reply, undefined);
  });

  test(`loop-${harness} fails when the harness gives no answer`, (t) => {
    const outcome = adapter(t, harness, {});
    assert.equal(outcome.status, 1);
    assert.equal(outcome.reply, undefined);
  });
}

test("loop-opencode asks for bare JSON matching the schema", (t) => {
  const outcome = adapter(t, "opencode", { STUB_STREAM: recording("opencode.jsonl") });
  assert.equal(outcome.args.at(-1), 'Review the plan.\n\nAnswer with exactly one JSON object that matches this JSON schema, and nothing else: no prose and no code fence.\n\n{"type":"object"}\n');
});

for (const [name, text] of Object.entries({ prose: "The plan looks fine.", "a fenced block": '```json\n{"findings":[]}\n```' })) {
  test(`loop-opencode rejects ${name} as the final message`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), "loop-stream-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const outcome = adapter(t, "opencode", { STUB_STREAM: textStream(dir, text) });
    assert.equal(outcome.status, 1);
    assert.match(outcome.stderr, /opencode's final message is not one JSON object/);
    assert.equal(outcome.reply, undefined);
  });
}

const finalAnswers: Record<string, (first: unknown, second: unknown) => unknown[]> = {
  claude: (first, second) => [
    { type: "result", subtype: "success", structured_output: first },
    { type: "result", subtype: "success", structured_output: second },
  ],
  agy: (first, second) => [
    { event: "result", result: { status: "SUCCESS", structured_output: first } },
    { event: "result", result: { status: "SUCCESS", structured_output: second } },
  ],
  opencode: (first, second) => [
    { type: "text", part: { text: JSON.stringify(first) } },
    { type: "text", part: { text: JSON.stringify(second) } },
  ],
};

for (const [harness, events] of Object.entries(finalAnswers)) {
  test(`loop-${harness} takes the last answer in the stream`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), "loop-stream-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const stream = join(dir, "stream.jsonl");
    writeFileSync(stream, events({ findings: [] }, REPLY).map((event) => JSON.stringify(event)).join("\n"));
    const outcome = adapter(t, harness, { STUB_STREAM: stream });
    assert.equal(outcome.status, 0, outcome.stderr);
    assert.deepEqual(outcome.reply, REPLY);
  });
}
