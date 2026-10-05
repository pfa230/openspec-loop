import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { REVIEW_SCHEMA } from "../src/prompts.js";
import { makeRepo, runLoop, type Turn } from "./helpers.js";

test("a worker gets the prompt, schema and reply paths last and runs in the run's worktree", (t) => {
  const repo = makeRepo(t);
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const [call] = repo.calls("reviewer");
  const base = join(repo.runDir(), "transcripts", "001-proposal-review");
  assert.deepEqual(call.args, ["reviewer", `${base}.prompt.md`, `${base}.schema.json`, `${base}.reply.json`]);
  assert.equal(call.cwd, repo.worktree);
  assert.match(readFileSync(`${base}.prompt.md`, "utf8"), /- openspec\/changes\/add-thing\/proposal\.md\n- openspec\/changes\/add-thing\/tasks\.md\n/);
  assert.deepEqual(JSON.parse(readFileSync(`${base}.schema.json`, "utf8")), REVIEW_SCHEMA);
  assert.match(readFileSync(`${base}.log`, "utf8"), /^stub reviewer turn/);
});

const failures: Record<string, [Turn, string]> = {
  "a nonzero exit": [{ exit: 3 }, "exit status 3"],
  "a signal": [{ kill: true }, "signal SIGKILL"],
  "a missing reply": [{ noReply: true }, "the worker wrote no reply"],
  "a reply that is not JSON": [{ raw: "APPROVE" }, "the reply is not JSON"],
  "a reply that does not match the schema": [{ reply: { verdict: "APPROVE" } }, "the reply does not match the schema"],
};

for (const [name, [turn, problem]] of Object.entries(failures)) {
  test(`${name} is an execution failure naming the transcript and the reply`, (t) => {
    const repo = makeRepo(t);
    repo.queue("reviewer", turn);
    const result = runLoop(repo, ["run", "add-thing"]);
    assert.equal(result.status, 1);
    const base = join(repo.runDir(), "transcripts", "001-proposal-review");
    assert.match(result.stdout, new RegExp(`\\] proposal-review: review 1 of 3 execution failure, ${problem} \\(reviewer\\)\\n`));
    assert.ok(
      result.stdout.includes(
        `Cause: execution failure of proposalReviewer agent "reviewer": ${problem}\nTranscript: ${base}.log\nReply: ${base}.reply.json\nRecovery: loop resume add-thing\n`,
      ),
      result.stdout,
    );
    assert.equal(repo.calls("reviewer").length, 1);
  });
}
