import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readUsage } from "../src/step.js";
import { OPENCODE_STUB } from "./helpers.js";

const root = new URL("../../", import.meta.url);
const recording = (name: string) => fileURLToPath(new URL(`test/recordings/${name}`, root));
const REPLY = { findings: [{ severity: "blocking", location: "design.md", problem: "the design is missing", question: null }] };

// A stub harness: logs its arguments, prints a recorded stream, writes the recorded answer after -o
// when given one, and exits with a chosen status.
const STUB = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify(args) + "\\n");
if (process.env.STUB_STREAM) process.stdout.write(fs.readFileSync(process.env.STUB_STREAM));
const out = args.indexOf("-o");
if (out >= 0 && process.env.STUB_ANSWER) fs.writeFileSync(args[out + 1], fs.readFileSync(process.env.STUB_ANSWER));
process.exit(Number(process.env.STUB_EXIT || 0));
`;

interface Outcome {
  status: number | null;
  stderr: string;
  args: string[];
  calls: number;
  reply: unknown;
  usage: unknown;
  stdout: string;
  requests: { method: string; path: string; directory: string; headers: Record<string, string>; body: any }[];
  state: { pid: number; config?: string; pure?: string; configDir?: string; tool?: string; streamClosed: boolean; terminated: boolean };
  dir: string;
}

function adapter(t: { after: (fn: () => void) => void }, harness: string, env: Record<string, string>, args: string[] = [], schema: object = { type: "object" }, response: object = { info: {}, parts: [] }, nodeArgs: string[] = []): Outcome {
  const dir = mkdtempSync(join(tmpdir(), "loop-adapter-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, harness), harness === "opencode" ? OPENCODE_STUB : STUB);
  chmodSync(join(dir, harness), 0o755);
  writeFileSync(join(dir, "prompt.md"), "Review the plan.\n");
  writeFileSync(join(dir, "schema.json"), `${JSON.stringify(schema)}\n`);
  writeFileSync(join(dir, "response.json"), JSON.stringify(response));
  const reply = join(dir, "reply.json");
  const usage = join(dir, "usage.json");
  const bin = fileURLToPath(new URL(`dist/src/adapters/${harness}.js`, root));
  const result = spawnSync(process.execPath, [...nodeArgs, bin, ...args, join(dir, "prompt.md"), join(dir, "schema.json"), reply, usage], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, OPENCODE_CONFIG_CONTENT: undefined, OPENCODE_CONFIG_DIR: undefined, OPENCODE_PURE: undefined, OPENCODE_SERVER_PASSWORD: undefined, OPENCODE_SERVER_USERNAME: undefined, PATH: `${dir}${delimiter}${process.env.PATH}`, STUB_LOG: join(dir, "args.json"), STUB_API_LOG: join(dir, "api.jsonl"), STUB_STATE_LOG: join(dir, "state.json"), STUB_RESPONSE: join(dir, "response.json"), ...env },
  });
  const calls: string[][] = existsSync(join(dir, "args.json")) ? readFileSync(join(dir, "args.json"), "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [];
  return {
    status: result.status,
    stderr: result.stderr,
    args: calls.at(-1) ?? [],
    calls: calls.length,
    reply: existsSync(reply) ? JSON.parse(readFileSync(reply, "utf8")) : undefined,
    usage: existsSync(usage) ? readFileSync(usage, "utf8") : undefined,
    stdout: result.stdout,
    requests: existsSync(join(dir, "api.jsonl")) ? readFileSync(join(dir, "api.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line)) : [],
    state: existsSync(join(dir, "state.json")) ? JSON.parse(readFileSync(join(dir, "state.json"), "utf8")) : undefined,
    dir,
  };
}

const nativeEvent = (part: object) => ({ type: "message.part.updated", properties: { part: { sessionID: "root", ...part } } });
const replyEvent = (input: object = REPLY, id = "reply", sessionID = "root", status = "completed") => nativeEvent({ id, sessionID, type: "tool", tool: "loop_reply", state: { status, input: { reply: JSON.stringify(input) } } });
function eventFile(t: { after: (fn: () => void) => void }, events: object[]): string {
  const dir = mkdtempSync(join(tmpdir(), "loop-stream-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "stream.jsonl");
  writeFileSync(path, events.map(event => JSON.stringify(event)).join("\n"));
  return path;
}
const promptRequest = (outcome: Outcome) => outcome.requests.find(request => request.path === "/session/root/message")!;
function cleaned(outcome: Outcome) {
  assert.equal(outcome.state.streamClosed, true);
  assert.equal(outcome.state.terminated, true);
  assert.throws(() => process.kill(outcome.state.pid, 0), /ESRCH/);
  assert.ok(outcome.state.configDir && !existsSync(outcome.state.configDir));
}

// The usage file each adapter writes for its recording, exactly.
const USAGE = {
  claude: '{"inputTokens":34441,"outputTokens":183,"costUsd":0.06978799999999999}\n',
  codex: '{"inputTokens":16641,"outputTokens":59}\n',
  agy: '{"inputTokens":12926,"outputTokens":700}\n',
  opencode: '{"inputTokens":13808,"outputTokens":29,"costUsd":0.000111024}\n',
};

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
};

for (const [harness, { args, env }] of Object.entries(cases)) {
  const usage = USAGE[harness as keyof typeof USAGE];
  test(`loop-${harness} runs ${harness} with the agent's arguments and writes the recorded answer and usage`, (t) => {
    const outcome = adapter(t, harness, env, ["--model", "opus"]);
    assert.equal(outcome.status, 0, outcome.stderr);
    assert.equal(outcome.calls, 1);
    const actual = outcome.args.map((arg) =>
      arg.endsWith("schema.json") ? "<schema>" : arg.endsWith("reply.json") ? "<reply>" : arg.startsWith("Review the plan.\n\nAfter completing") ? "<request>" : arg,
    );
    assert.deepEqual(actual, args);
    assert.deepEqual(outcome.reply, REPLY);
    assert.equal(outcome.usage, usage);
  });

  test(`loop-${harness} exits with the harness's status when it fails, keeping the usage it reported`, (t) => {
    const outcome = adapter(t, harness, { ...env, STUB_EXIT: "5" });
    assert.equal(outcome.status, 5);
    assert.match(outcome.stderr, new RegExp(`${harness} exited with status 5`));
    if (harness !== "codex") assert.equal(outcome.reply, undefined);
    assert.equal(outcome.usage, usage);
  });

  test(`loop-${harness} fails when the harness gives no answer, and writes no usage`, (t) => {
    const outcome = adapter(t, harness, {});
    assert.equal(outcome.status, 1);
    assert.equal(outcome.reply, undefined);
    assert.equal(outcome.usage, undefined);
  });
}

const usageEvents: Record<string, (usage: unknown) => object> = {
  claude: (usage) => ({ type: "result", subtype: "success", structured_output: REPLY, usage, total_cost_usd: 0, duration_ms: 99 }),
  codex: (usage) => ({ type: "turn.completed", usage, index: 99 }),
  agy: (usage) => ({ event: "result", result: { status: "SUCCESS", structured_output: REPLY, usage, duration_seconds: 99 } }),
  opencode: (tokens) => nativeEvent({ id: "counter-step", type: "step-finish", tokens, cost: 0, index: 99 }),
};

// Each harness's native usage with every field of its totals, other counters and metadata, and the totals it maps to.
const OTHER = { details: { thinking_tokens: 3 }, iterations: [{ output_tokens: 2 }, null], new_requests: 2, service_tier: "standard" };
const nativeUsage: Record<string, { native: object; usage: string }> = {
  claude: { native: { input_tokens: 7, cache_creation_input_tokens: 2, cache_read_input_tokens: 1, output_tokens: 3, ...OTHER }, usage: '{"inputTokens":10,"outputTokens":3,"costUsd":0}\n' },
  codex: { native: { input_tokens: 7, cached_input_tokens: 4, output_tokens: 3, reasoning_output_tokens: 1, ...OTHER }, usage: '{"inputTokens":7,"outputTokens":3}\n' },
  agy: { native: { input_tokens: 7, cache_read_tokens: 3, output_tokens: 3, thinking_tokens: 1, total_tokens: 10, ...OTHER }, usage: '{"inputTokens":10,"outputTokens":3}\n' },
  opencode: { native: { input: 7, cache: { read: 2, write: 1 }, output: 3, reasoning: 1, total: 14, ...OTHER }, usage: '{"inputTokens":10,"outputTokens":4,"costUsd":0}\n' },
};

for (const [harness, event] of Object.entries(usageEvents)) {
  const run = (t: TestContext, native: object) => {
    const dir = mkdtempSync(join(tmpdir(), "loop-stream-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const stream = join(dir, "stream.jsonl");
    const events = [event(native), harness === "opencode" ? replyEvent() : { type: "text", part: { text: JSON.stringify(REPLY) } }];
    writeFileSync(stream, events.map((value) => JSON.stringify(value)).join("\n"));
    return adapter(t, harness, { ...(harness === "opencode" ? {} : cases[harness as keyof typeof cases].env), STUB_STREAM: stream });
  };

  test(`loop-${harness} writes only its input and output totals and reported cost, leaving other counters and metadata out`, (t) => {
    const outcome = run(t, nativeUsage[harness].native);
    assert.equal(outcome.status, 0, outcome.stderr);
    assert.equal(outcome.calls, 1);
    assert.deepEqual(outcome.reply, REPLY);
    assert.equal(outcome.usage, nativeUsage[harness].usage);
  });

  test(`loop-${harness} writes an invalid input total when a field of it is negative`, (t) => {
    const outcome = run(t, harness === "opencode" ? { input: 7, cache: { read: -1 } } : { input_tokens: -1 });
    assert.equal(JSON.parse(outcome.usage as string).inputTokens, null);
    assert.deepEqual(readUsage(join(outcome.dir, "usage.json")), { problem: "the usage file does not match the usage format" });
  });

  if (harness === "opencode") continue;
  test(`loop-${harness} uses its final usage summary without adding earlier cumulative summaries`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), "loop-stream-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const stream = join(dir, "stream.jsonl");
    writeFileSync(stream, [event({ input_tokens: 10, output_tokens: 2 }), event({ input_tokens: 15, output_tokens: 5 })].map((value) => JSON.stringify(value)).join("\n"));
    const outcome = adapter(t, harness, { ...(harness === "opencode" ? {} : cases[harness as keyof typeof cases].env), STUB_STREAM: stream });
    assert.equal(outcome.status, 0, outcome.stderr);
    const cost = harness === "claude" ? ',"costUsd":0' : "";
    assert.equal(outcome.usage, `{"inputTokens":15,"outputTokens":5${cost}}\n`);
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


test("OpenCode offers the schema's properties through its reply tool in one fresh session and preserves inherited configuration and auth", async (t) => {
  const inline = '{ // inherited settings\n"model":"provider/default","permission":{"edit":"deny"},"plugin":["existing"],}';
  const schema = { type: "object", additionalProperties: false, required: ["findings"], properties: { findings: { type: "array" } } };
  const outcome = adapter(t, "opencode", { STUB_STREAM: recording("opencode-structured.jsonl"), OPENCODE_CONFIG_CONTENT: inline, OPENCODE_SERVER_PASSWORD: "fixture-secret", OPENCODE_SERVER_USERNAME: "fixture-user" }, [], schema);
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.equal(outcome.calls, 1);
  assert.deepEqual(outcome.args, ["serve", "--hostname", "127.0.0.1", "--port", "0", "--mdns=false"]);
  assert.equal(outcome.state.config, inline);
  assert.equal(outcome.requests.filter(request => request.path === "/session").length, 1);
  const prompt = promptRequest(outcome);
  assert.equal(outcome.requests.filter(request => request.path === prompt.path).length, 1);
  assert.equal(prompt.body.format, undefined);
  assert.equal(prompt.body.model, undefined);
  assert.equal(prompt.body.agent, undefined);
  assert.equal(prompt.body.variant, undefined);
  assert.match(prompt.body.parts[0].text, /^Review the plan\.\n\nAfter completing the work and any required presentation, finish by calling the loop_reply tool/);
  const toolFile = join(outcome.dir, "loop_reply.mjs");
  writeFileSync(toolFile, outcome.state.tool!);
  const tool = (await import(pathToFileURL(toolFile).href)).default;
  assert.deepEqual(Object.keys(tool.args), ["reply"]);
  assert.equal(tool.args.reply.type, "string");
  assert.match(tool.args.reply.description, /"findings"/);
  assert.equal(typeof await tool.execute({ reply: JSON.stringify({ findings: [] }) }), "string");
  await assert.rejects(tool.execute({}), /string reply/);
  await assert.rejects(tool.execute({ reply: "not json" }), /not valid JSON/);
  await assert.rejects(tool.execute({ reply: "null" }), /decode to a JSON object/);
  await assert.rejects(tool.execute({ reply: "[]" }), /decode to a JSON object/);
  await assert.rejects(tool.execute({ reply: "{}" }), /missing required properties: findings\./);
  assert.equal(typeof await tool.execute({ reply: JSON.stringify({ findings: "not an array" }) }), "string");
  assert.deepEqual(outcome.requests.find(request => request.path === "/session")!.body.permission, [
    { permission: "question", pattern: "*", action: "deny" },
    { permission: "plan_enter", pattern: "*", action: "deny" },
    { permission: "plan_exit", pattern: "*", action: "deny" },
  ]);
  for (const request of outcome.requests) {
    assert.equal(request.directory, realpathSync(outcome.dir));
    assert.equal(request.headers.authorization, "Basic " + Buffer.from("fixture-user:fixture-secret").toString("base64"));
  }
  assert.doesNotMatch(outcome.stdout + outcome.stderr, /fixture-secret|fixture-user/);
  assert.deepEqual(outcome.reply, REPLY);
  assert.equal(outcome.usage, USAGE.opencode);
  cleaned(outcome);
});

test("OpenCode's reply tool and adapter preserve actual null and non-null values through the string transport", async (t) => {
  const schema = { type: "object", additionalProperties: false, required: ["planProblem"], properties: { planProblem: { type: ["string", "null"] } } };
  const outcome = adapter(t, "opencode", { STUB_STREAM: recording("opencode-cut-report.jsonl") }, [], schema);
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.deepEqual(outcome.reply, { planProblem: null });
  assert.strictEqual((outcome.reply as { planProblem: unknown }).planProblem, null);
  const toolFile = join(outcome.dir, "loop_reply.mjs");
  writeFileSync(toolFile, outcome.state.tool!);
  const tool = (await import(pathToFileURL(toolFile).href)).default;
  assert.equal(typeof await tool.execute({ reply: '{"planProblem":null}' }), "string");
  assert.equal(typeof await tool.execute({ reply: '{"planProblem":"task 1.1 needs a format"}' }), "string");
  assert.equal(typeof await tool.execute({ reply: '{"planProblem":"null"}' }), "string");
  cleaned(outcome);
});

test("OpenCode writes a decoded empty acknowledgement object", (t) => {
  const outcome = adapter(t, "opencode", { STUB_STREAM: eventFile(t, [replyEvent({})]) }, [], { type: "object" });
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.deepEqual(outcome.reply, {});
  cleaned(outcome);
});

test("OpenCode treats a completed reply-tool call with a malformed envelope as an execution failure", (t) => {
  const stream = eventFile(t, [nativeEvent({ id: "bad", type: "tool", tool: "loop_reply", state: { status: "completed", input: { reply: "not json" } } })]);
  const outcome = adapter(t, "opencode", { STUB_STREAM: stream });
  assert.equal(outcome.status, 1, outcome.stderr);
  assert.match(outcome.stderr, /not valid JSON/);
  assert.equal(outcome.reply, undefined);
  cleaned(outcome);
});

for (const [args, env, forwarded] of [
  [["--pure"], {}, "--pure=true"], [["--pure=true"], {}, "--pure=true"], [["--pure", "false"], {}, "--pure=false"], [["--no-pure"], {}, "--pure=false"],
  [[], { OPENCODE_PURE: "true" }, undefined],
] as [string[], Record<string, string>, string | undefined][]) {
  test(`OpenCode reply tool works with pure selection ${JSON.stringify({ args, env })}`, (t) => {
    const outcome = adapter(t, "opencode", { ...env, STUB_STREAM: recording("opencode-structured.jsonl") }, args);
    assert.equal(outcome.status, 0, outcome.stderr);
    assert.deepEqual(outcome.reply, REPLY);
    assert.equal(outcome.state.pure, env.OPENCODE_PURE);
    assert.deepEqual(outcome.args.slice(6), forwarded ? [forwarded] : []);
    cleaned(outcome);
  });
}

for (const args of [
  ["-m", "provider/model", "--agent", "plan", "--variant", "high", "--auto", "false"],
  ["--model=provider/model", "--agent=plan", "--variant=high", "--auto=false"],
]) {
  test(`OpenCode maps supported selections ${JSON.stringify(args)}`, (t) => {
    const outcome = adapter(t, "opencode", { STUB_STREAM: recording("opencode-structured.jsonl") }, args);
    assert.equal(outcome.status, 0, outcome.stderr);
    const body = promptRequest(outcome).body;
    assert.deepEqual(body.model, { providerID: "provider", modelID: "model" });
    assert.equal(body.agent, "plan");
    assert.equal(body.variant, "high");
    cleaned(outcome);
  });
}

for (const args of [["--attach", "http://localhost:4096"], ["--session=old"], ["--continue"], ["--command", "test"], ["--dir", "/tmp"], ["--fork"], ["--format=json"], ["-f", "file"], ["--unknown"], ["unexpected"]]) {
  test(`OpenCode refuses unsupported argument ${args[0]} before launch`, (t) => {
    const outcome = adapter(t, "opencode", {}, args);
    assert.equal(outcome.status, 1);
    assert.ok(outcome.stderr.includes(args[0].split("=")[0]), outcome.stderr);
    assert.equal(outcome.calls, 0);
    assert.equal(outcome.reply, undefined);
  });
}

test("OpenCode refuses an inherited OPENCODE_CONFIG_DIR before launch", (t) => {
  const outcome = adapter(t, "opencode", { OPENCODE_CONFIG_DIR: "/tmp/user-opencode" });
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /OPENCODE_CONFIG_DIR/);
  assert.equal(outcome.calls, 0);
  assert.equal(outcome.reply, undefined);
});

for (const text of ["The plan looks fine.", '```json\n{"findings":[]}\n```', JSON.stringify(REPLY)]) {
  test(`OpenCode text cannot supply its reply: ${text}`, (t) => {
    const stream = eventFile(t, [nativeEvent({ id: "text", type: "text", text })]);
    const outcome = adapter(t, "opencode", { STUB_STREAM: stream }, [], undefined, { info: {}, parts: [{ type: "text", text }] });
    assert.equal(outcome.status, 1);
    assert.match(outcome.stderr, /without a loop_reply call/);
    assert.equal(outcome.reply, undefined);
    assert.match(outcome.stdout, /message.part.updated/);
    cleaned(outcome);
  });
}

test("issue #54: cut report plus JSON stays in transcript and a missing reply-tool call retains usage", (t) => {
  const rows = readFileSync(recording("opencode-cut-report.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(row => row.properties.part.tool !== "loop_reply");
  const outcome = adapter(t, "opencode", { STUB_STREAM: eventFile(t, rows) }, [], undefined, { info: {}, parts: [{ type: "text", text: '{"planProblem":null}' }] });
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /without a loop_reply call/);
  assert.equal(outcome.reply, undefined);
  assert.match(outcome.stdout, /Cut pass:/);
  assert.equal(outcome.usage, '{"inputTokens":11,"outputTokens":13,"costUsd":0}\n');
  assert.equal(outcome.calls, 1);
  assert.equal(outcome.requests.filter(request => request.path === "/session/root/message").length, 2);
  cleaned(outcome);
});

test("OpenCode sends one same-session follow-up prompt when a completed prompt has no reply-tool call", (t) => {
  const outcome = adapter(t, "opencode", {
    STUB_STREAM: eventFile(t, [nativeEvent({ id: "text", type: "text", text: "Done." })]),
    STUB_FOLLOW_UP_STREAM: eventFile(t, [replyEvent()]),
  }, ["-m", "meta/muse-spark-1.3-contributor"]);
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.deepEqual(outcome.reply, REPLY);
  const prompts = outcome.requests.filter(request => request.path === "/session/root/message");
  assert.equal(prompts.length, 2);
  for (const prompt of prompts) assert.deepEqual(prompt.body.model, { providerID: "meta", modelID: "muse-spark-1.3-contributor" });
  assert.match(prompts[1].body.parts[0].text, /without calling loop_reply/);
  cleaned(outcome);
});

test("OpenCode takes the last completed root reply-tool call, ignoring text, failed calls and delegated sessions", (t) => {
  const cut = readFileSync(recording("opencode-cut-report.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  const stream = eventFile(t, [...cut,
    replyEvent({ planProblem: "later root call" }, "later"),
    replyEvent({ planProblem: "failed root call" }, "failed", "root", "error"),
    replyEvent({ planProblem: "delegated call" }, "delegated", "child"),
    nativeEvent({ id: "trailing", type: "text", text: '{"planProblem":"different text"}' }),
  ]);
  const outcome = adapter(t, "opencode", { STUB_STREAM: stream });
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.deepEqual(outcome.reply, { planProblem: "later root call" });
  assert.match(outcome.stdout, /Cut pass:/);
  assert.equal(outcome.requests.filter(request => request.path.endsWith("/message")).length, 1);
  cleaned(outcome);
});

test("OpenCode drains response-before-idle events and sums each latest root step once", (t) => {
  const step = (id: string, input: number, cost: number, sessionID = "root") => nativeEvent({ id, sessionID, type: "step-finish", tokens: { input, output: 1, reasoning: 0, cache: { read: 2, write: 0 }, total: input + 3, new_requests: 3, iterations: [{ input_tokens: input }] }, cost });
  const stream = eventFile(t, [step("first", 90, 0.1), step("first", 100, 0.25), step("child", 900, 9, "child"), { type: "session.status", properties: { sessionID: "other", status: { type: "idle" } } }, replyEvent()]);
  const late = eventFile(t, [step("last", 50, 0.5)]);
  const outcome = adapter(t, "opencode", { STUB_STREAM: stream, STUB_LATE_STREAM: late });
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.equal(outcome.usage, '{"inputTokens":154,"outputTokens":2,"costUsd":0.75}\n');
  cleaned(outcome);
});

for (const field of ["output", "cache.read", "costUsd"]) {
  for (const counts of [[-1, 5], [5, -1]]) {
    test(`OpenCode keeps a negative ${field} invalid across distinct steps in order ${counts}`, (t) => {
      const stream = eventFile(t, counts.map((count, index) => nativeEvent({
        id: `step-${index}`,
        type: "step-finish",
        tokens: { input: 2, ...(field === "output" ? { output: count } : field === "cache.read" ? { cache: { read: count } } : {}) },
        cost: field === "costUsd" ? count : 0,
      })).concat(replyEvent()));
      const outcome = adapter(t, "opencode", { STUB_STREAM: stream });
      assert.equal(outcome.status, 0, outcome.stderr);
      assert.deepEqual(outcome.reply, REPLY);
      assert.deepEqual(JSON.parse(outcome.usage as string), field === "output"
        ? { inputTokens: 4, outputTokens: null, costUsd: 0 }
        : field === "cache.read" ? { inputTokens: null, costUsd: 0 } : { inputTokens: 4, costUsd: null });
      assert.deepEqual(readUsage(join(outcome.dir, "usage.json")), { problem: "the usage file does not match the usage format" });
    });
  }
}

test("OpenCode replaces an invalid earlier snapshot with valid latest step usage", (t) => {
  const step = (id: string, count: number) => nativeEvent({
    id, type: "step-finish", tokens: { output: count, cache: { read: count } }, cost: count,
  });
  const stream = eventFile(t, [step("first", -1), step("first", 5), step("second", 2), replyEvent()]);
  const outcome = adapter(t, "opencode", { STUB_STREAM: stream });
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.deepEqual(outcome.reply, REPLY);
  const expected = { inputTokens: 7, outputTokens: 7, costUsd: 7 };
  assert.deepEqual(JSON.parse(outcome.usage as string), expected);
  assert.deepEqual(readUsage(join(outcome.dir, "usage.json")), { usage: expected });
});

for (const failure of ["http", "response", "session", "stream"]) {
  test(`OpenCode ${failure} failure preserves streamed usage and cleans its server`, (t) => {
    const rows = readFileSync(recording("opencode-cut-report.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    if (failure === "session") rows.push({ type: "session.error", properties: { sessionID: "root", error: { name: "APIError", data: { message: "root failure" } } } });
    const outcome = adapter(t, "opencode", { STUB_STREAM: eventFile(t, rows), ...(failure === "http" ? { STUB_HTTP_ERROR: "503" } : {}), ...(failure === "stream" ? { STUB_MODE: "stream-close" } : {}) }, [], undefined, { info: failure === "response" ? { error: { name: "APIError", data: { message: "response failure" } } } : {}, parts: [] });
    assert.equal(outcome.status, 1, outcome.stderr);
    assert.equal(outcome.reply, undefined);
    assert.equal(outcome.usage, '{"inputTokens":11,"outputTokens":13,"costUsd":0}\n');
    assert.match(outcome.stderr, failure === "http" ? /503|API/ : failure === "response" ? /response failure/ : failure === "session" ? /root failure|APIError/ : /stream/);
    cleaned(outcome);
  });
}

for (const [mode, httpError, context] of [
  ["drop-headers", "", /POST \/session\/root\/message request failed/],
  ["drop-body", "", /POST \/session\/root\/message response read failed/],
  ["drop-body", "503", /POST \/session\/root\/message response read failed \(HTTP 503\)/],
  ["drop-events", "", /GET \/event response read failed/],
] as const) {
  test(`OpenCode ${mode} ${httpError} retains the originating error before cleanup without leaking authentication`, (t) => {
    const password = "fixture-secret";
    const authorization = Buffer.from(`fixture-user:${password}`).toString("base64");
    const outcome = adapter(t, "opencode", {
      STUB_MODE: mode, STUB_HTTP_ERROR: httpError,
      STUB_STREAM: recording("opencode-structured.jsonl"),
      OPENCODE_SERVER_PASSWORD: password, OPENCODE_SERVER_USERNAME: "fixture-user",
    });
    assert.equal(outcome.status, 1, outcome.stderr);
    assert.equal(outcome.reply, undefined);
    assert.equal(outcome.usage, USAGE.opencode);
    assert.match(outcome.stderr, context);
    assert.match(outcome.stderr, /\[cause\]: TypeError: (fetch failed|terminated)/);
    assert.match(outcome.stderr, /\[cause\]: SocketError: [^\n]*\n\s+at /);
    assert.match(outcome.stderr, /UND_ERR_SOCKET/);
    assert.equal((outcome.stdout + outcome.stderr).includes(password), false);
    assert.equal((outcome.stdout + outcome.stderr).includes(authorization), false);
    assert.equal(outcome.requests.filter(request => request.path === "/session/root/message").length, 1);
    cleaned(outcome);
  });
}

test("OpenCode spawn failure retains its original error code and stack", (t) => {
  const outcome = adapter(t, "opencode", { PATH: "/nonexistent" });
  assert.equal(outcome.status, 1, outcome.stderr);
  assert.match(outcome.stderr, /cannot run opencode/);
  assert.match(outcome.stderr, /\[cause\]: Error: spawn opencode ENOENT\n\s+at /);
  assert.match(outcome.stderr, /code: 'ENOENT'/);
  assert.equal(outcome.reply, undefined);
});

for (const [args, auto] of [[[], false], [["--auto"], true], [["--auto=true"], true], [["--auto=false"], false], [["--auto", "false"], false], [["--no-auto"], false]] as [string[], boolean][]) {
  test(`OpenCode permission selection ${JSON.stringify(args)} ${auto ? "approves once" : "rejects"} for root and known descendants only`, (t) => {
    const session = (id: string, parentID: string) => ({ type: "session.created", properties: { info: { id, parentID } } });
    const ask = (id: string, sessionID: string) => ({ type: "permission.asked", properties: { id, sessionID, permission: "edit", patterns: ["*"] } });
    const stream = eventFile(t, [session("child", "root"), session("grandchild", "child"), session("unrelated", "other"), ask("root-ask", "root"), ask("child-ask", "child"), ask("grandchild-ask", "grandchild"), ask("other-ask", "unrelated"), { type: "session.error", properties: { sessionID: "unrelated", error: { name: "OtherError" } } }, replyEvent()]);
    const inline = '{"permission":{"edit":"deny"}}';
    const outcome = adapter(t, "opencode", { STUB_STREAM: stream, OPENCODE_CONFIG_CONTENT: inline }, args);
    assert.equal(outcome.status, 0, outcome.stderr);
    assert.equal(outcome.state.config, inline);
    const replies = outcome.requests.filter(request => request.path.startsWith("/permission/"));
    assert.deepEqual(replies.map(request => [request.path, request.body]), ["root-ask", "child-ask", "grandchild-ask"].map(id => [`/permission/${id}/reply`, { reply: auto ? "once" : "reject" }]));
    cleaned(outcome);
  });
}

for (const mode of ["early-exit", "no-ready"]) {
  test(`OpenCode ${mode} startup failure launches no prompt and leaves no server`, (t) => {
    const outcome = adapter(t, "opencode", { STUB_MODE: mode });
    assert.equal(outcome.status, mode === "early-exit" ? 5 : 1, outcome.stderr);
    assert.equal(outcome.requests.length, 0);
    assert.equal(outcome.reply, undefined);
    assert.match(outcome.stderr, mode === "early-exit" ? /status 5/ : /ready|readiness|start|timeout/i);
    assert.throws(() => process.kill(outcome.state.pid, 0), /ESRCH/);
    if (mode === "no-ready") assert.equal(outcome.state.terminated, true);
  });
}

test("OpenCode unexpected exit preserves its status and reported usage", (t) => {
  const outcome = adapter(t, "opencode", { STUB_STREAM: recording("opencode-structured.jsonl"), STUB_EXIT: "5" });
  assert.equal(outcome.status, 5, outcome.stderr);
  assert.match(outcome.stderr, /opencode exited with status 5/);
  assert.equal(outcome.reply, undefined);
  assert.equal(outcome.usage, USAGE.opencode);
  assert.throws(() => process.kill(outcome.state.pid, 0), /ESRCH/);
});

test("OpenCode bounds shutdown when its owned server ignores graceful termination", (t) => {
  const outcome = adapter(t, "opencode", { STUB_MODE: "ignore-term", STUB_STREAM: recording("opencode-structured.jsonl") });
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.deepEqual(outcome.reply, REPLY);
  assert.equal(outcome.state.streamClosed, true);
  assert.equal(outcome.state.terminated, false);
  assert.throws(() => process.kill(outcome.state.pid, 0), /ESRCH/);
});

for (const mode of ["hold-headers", "hold-body", "hold-events"]) {
  test(`OpenCode interruption during ${mode} closes its subscription and terminates the owned child`, async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "loop-interrupt-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, "opencode"), OPENCODE_STUB);
    chmodSync(join(dir, "opencode"), 0o755);
    writeFileSync(join(dir, "prompt.md"), "Do the work.");
    writeFileSync(join(dir, "schema.json"), '{"type":"object"}');
    const child = spawn(process.execPath, [fileURLToPath(new URL("dist/src/adapters/opencode.js", root)), join(dir, "prompt.md"), join(dir, "schema.json"), join(dir, "reply.json"), join(dir, "usage.json")], {
      cwd: dir, env: { ...process.env, OPENCODE_CONFIG_CONTENT: undefined, OPENCODE_CONFIG_DIR: undefined, OPENCODE_PURE: undefined, OPENCODE_SERVER_PASSWORD: undefined, OPENCODE_SERVER_USERNAME: undefined, PATH: `${dir}${delimiter}${process.env.PATH}`, STUB_LOG: join(dir, "args.jsonl"), STUB_API_LOG: join(dir, "api.jsonl"), STUB_STATE_LOG: join(dir, "state.json"), STUB_MODE: mode, STUB_STREAM: recording("opencode-cut-report.jsonl") },
    });
    let stderr = "";
    child.stderr.on("data", chunk => stderr += chunk);
    child.stdout.resume();
    const exited = new Promise(resolve => child.once("close", resolve));
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
    const deadline = Date.now() + 5000;
    while (!existsSync(join(dir, "api.jsonl")) || !readFileSync(join(dir, "api.jsonl"), "utf8").includes("/message")) {
      assert.ok(Date.now() < deadline && child.exitCode === null, stderr);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    // Let the already-written usage events reach the adapter before interrupting it.
    await new Promise(resolve => setTimeout(resolve, 50));
    child.kill("SIGTERM");
    await exited;
    assert.equal(child.exitCode, 143, stderr);
    const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
    assert.equal(state.streamClosed, true);
    assert.equal(state.terminated, true);
    assert.throws(() => process.kill(state.pid, 0), /ESRCH/);
    assert.equal(existsSync(join(dir, "reply.json")), false);
    assert.equal(existsSync(state.configDir), false);
    assert.equal(readFileSync(join(dir, "usage.json"), "utf8"), '{"inputTokens":11,"outputTokens":13,"costUsd":0}\n');
  });
}

for (const mode of ["delay-headers", "delay-body", "delay-events"]) {
  const preload = ["--import", fileURLToPath(new URL("dist/test/fixtures/opencode-timeouts.js", root))];
  const env = { STUB_MODE: mode, STUB_STREAM: recording("opencode-structured.jsonl") };
  for (const control of ["agent", "default", "global"]) {
    test(`OpenCode ${mode} timeout control uses ${control} defaults in the adapter child`, (t) => {
      const outcome = adapter(t, "opencode", { ...env, TEST_OPENCODE_FETCH: control }, [], undefined, undefined, preload);
      assert.equal(outcome.status, 1, outcome.stderr);
      assert.match(outcome.stderr, mode === "delay-headers" ? /UND_ERR_HEADERS_TIMEOUT/ : /UND_ERR_BODY_TIMEOUT/);
      assert.equal(outcome.reply, undefined);
      cleaned(outcome);
    });
  }
  test(`OpenCode explicitly configured transport waits through ${mode}`, (t) => {
    const outcome = adapter(t, "opencode", env, [], undefined, undefined, preload);
    assert.equal(outcome.status, 0, outcome.stderr);
    assert.deepEqual(outcome.reply, REPLY);
    assert.equal(outcome.usage, USAGE.opencode);
    cleaned(outcome);
  });
}

const NULLABLE = { type: "object", additionalProperties: false, required: ["planProblem"], properties: { planProblem: { type: ["string", "null"] } } };

test("OpenCode 1.19.1/MiMo API recording carries actual null, keeps the cut report and preserves both model steps", (t) => {
  const recorded = JSON.parse(readFileSync(recording("opencode-api-mimo.json"), "utf8"));
  const outcome = adapter(t, "opencode", { STUB_STREAM: eventFile(t, recorded.events) }, ["-m", "openrouter/xiaomi/mimo-v2.6-flash"], NULLABLE, recorded.response);
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.equal(promptRequest(outcome).body.format, undefined);
  assert.deepEqual(outcome.reply, { planProblem: null });
  assert.strictEqual((outcome.reply as { planProblem: unknown }).planProblem, null);
  assert.match(outcome.stdout, /"text":"Cut pass: No commands run/);
  assert.match(outcome.stdout, /"tool":"loop_reply".*"status":"completed"/);
  assert.equal(outcome.usage, '{"inputTokens":14794,"outputTokens":41,"costUsd":0.00076552}\n');
  cleaned(outcome);
});

test("OpenCode 1.19.1/MiMo API recording keeps a nested nullable review finding", (t) => {
  const recorded = JSON.parse(readFileSync(recording("opencode-api-mimo-review.json"), "utf8"));
  const schema = { type: "object", additionalProperties: false, required: ["findings"], properties: { findings: { type: "array" } } };
  const outcome = adapter(t, "opencode", { STUB_STREAM: eventFile(t, recorded.events) }, ["-m", "openrouter/xiaomi/mimo-v2.6-flash"], schema, recorded.response);
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.deepEqual(outcome.reply, REPLY);
  assert.strictEqual((outcome.reply as { findings: { question: unknown }[] }).findings[0].question, null);
  assert.equal(outcome.usage, '{"inputTokens":15009,"outputTokens":77,"costUsd":0.0007793576}\n');
  cleaned(outcome);
});

test("OpenCode 1.19.1/Muse API recording carries actual null through automatic tool choice", (t) => {
  const recorded = JSON.parse(readFileSync(recording("opencode-api-muse.json"), "utf8"));
  const outcome = adapter(t, "opencode", { STUB_STREAM: eventFile(t, recorded.events) }, ["-m", "meta/muse-spark-1.3-contributor"], NULLABLE, recorded.response);
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.equal(promptRequest(outcome).body.format, undefined);
  assert.deepEqual(outcome.reply, { planProblem: null });
  assert.strictEqual((outcome.reply as { planProblem: unknown }).planProblem, null);
  assert.match(outcome.stdout, /"text":"Cut pass: adapter verification probe acknowledged/);
  assert.match(outcome.stdout, /"tool":"loop_reply".*"status":"completed"/);
  assert.equal(outcome.usage, '{"inputTokens":15782,"outputTokens":870,"costUsd":0.001026118}\n');
  cleaned(outcome);
});
