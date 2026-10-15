import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { REVIEW_SCHEMA } from "../src/prompts.js";
import { nextStep } from "../src/step.js";
import { makeRepo, runLoop, type Turn } from "./helpers.js";

test("a worker gets the prompt, schema, reply and usage paths last and runs in the run's worktree", (t) => {
  const repo = makeRepo(t);
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const [call] = repo.calls("reviewer");
  const base = join(repo.runDir(), "transcripts", "001-proposal-review");
  assert.deepEqual(call.args, ["reviewer", `${base}.prompt.md`, `${base}.schema.json`, `${base}.reply.json`, `${base}.usage.json`]);
  assert.equal(call.cwd, repo.worktree);
  assert.match(readFileSync(`${base}.prompt.md`, "utf8"), /- openspec\/changes\/add-thing\/proposal\.md\n- openspec\/changes\/add-thing\/tasks\.md\n/);
  assert.deepEqual(JSON.parse(readFileSync(`${base}.schema.json`, "utf8")), REVIEW_SCHEMA);
  assert.match(readFileSync(`${base}.log`, "utf8"), /^stub reviewer turn/);
});

test("a worker runs with SHELL set to bash whatever shell the loop inherits", (t) => {
  const repo = makeRepo(t);
  repo.env.SHELL = "/usr/bin/zsh";
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  assert.equal(repo.calls("reviewer")[0].shell, "bash");
});

const failures: Record<string, [Turn, string]> = {
  "a nonzero exit": [{ exit: 3 }, "exit status 3"],
  "a signal": [{ kill: true }, "signal SIGKILL"],
  "a missing reply": [{ noReply: true }, "the worker wrote no reply"],
  "a reply that is not JSON": [{ raw: "APPROVE" }, "the reply is not JSON"],
  "a reply that does not match the schema": [{ reply: { verdict: "APPROVE" } }, "the reply does not match the schema"],
  "a usage file that is not JSON": [{ usage: "{" }, "the usage file is not JSON"],
  "a usage file with an unknown key": [{ usage: { cost: 1 } }, "the usage file does not match the usage format"],
  "a leftover tokens map": [{ usage: { tokens: { input_tokens: 1 } } }, "the usage file does not match the usage format"],
  "a negative token total": [{ usage: { inputTokens: -1 } }, "the usage file does not match the usage format"],
  "a nonfinite token total": [{ usage: '{"outputTokens":1e400}' }, "the usage file does not match the usage format"],
};

for (const [name, [turn, problem]] of Object.entries(failures)) {
  test(`${name} is an execution failure naming the transcript and the reply`, (t) => {
    const repo = makeRepo(t);
    repo.queue("reviewer", turn);
    const result = runLoop(repo, ["run", "add-thing"]);
    assert.equal(result.status, 1);
    const base = join(repo.runDir(), "transcripts", "001-proposal-review");
    assert.match(result.stdout, new RegExp(`\\] proposal-review: review 1 of 3 execution failure, ${problem} \\(reviewer; usage unavailable\\)\\n`));
    assert.ok(
      result.stdout.includes(
        `Cause: execution failure of proposalReviewer agent "reviewer" in review 1 of 3: ${problem}\nTranscript: ${base}.log\nReply: ${base}.reply.json\nUsage: ${base}.usage.json\nRecovery: loop resume add-thing\n`,
      ),
      result.stdout,
    );
    assert.equal(repo.calls("reviewer").length, 1);
  });
}

test("a worker step's end line shows its usage and cost as reported, or as unavailable", (t) => {
  const repo = makeRepo(t);
  repo.queue("reviewer", { usage: { inputTokens: 332936, outputTokens: 2234, costUsd: 0.5728622 } });
  repo.queue("verifier", { usage: { inputTokens: 5, outputTokens: 0 } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /\] proposal-review: review 1 of 3 APPROVE, 0 blocking, 0 minor \(reviewer; input 332,936, output 2,234, cost \$0\.57\)\n/);
  assert.match(result.stdout, /\] implementation: attempt 1 of 3, review APPROVE, 0 blocking, 0 minor \(verifier; input 5, output 0, cost unavailable\)\n/);
});

test("a failed worker's usage shows on its execution-failure line, and the cause names the step", (t) => {
  const repo = makeRepo(t);
  repo.queue("reviewer", { usage: { inputTokens: 7 }, exit: 3 });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\] proposal-review: review 1 of 3 execution failure, exit status 3 \(reviewer; input 7, output unavailable, cost unavailable\)\n/);
  assert.match(result.stdout, /Cause: execution failure of proposalReviewer agent "reviewer" in review 1 of 3: exit status 3\n/);
});

test("step numbers keep increasing past 999", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "loop-steps-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "transcripts"));
  writeFileSync(join(dir, "transcripts", "999-plan-revision.log"), "");
  writeFileSync(join(dir, "transcripts", "1000-proposal-review.log"), "");
  assert.equal(nextStep(dir, "proposal-review"), join(dir, "transcripts", "1001-proposal-review"));
});
