import assert from "node:assert/strict";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readState } from "../src/state.js";
import { makeRepo, runLoop, writeFile } from "./helpers.js";

test("run from a fresh issue worktree uses ignored primary local settings without copying them", (t) => {
  const repo = makeRepo(t, { branch: "issue", delivery: "pr" });
  repo.git("switch", "--quiet", "main");
  const issue = join(repo.root, "issue");
  repo.git("worktree", "add", "--quiet", issue, "issue");
  appendFileSync(join(repo.top, ".git/info/exclude"), "openspec/loop.local.yaml\n");
  const shared = `agents:
  personalReviewer: [stub-agent, reviewer, --model, personal-review]
  personalImplementer: [stub-agent, implementer, --model, personal-implementation]
roles:
  proposalReviewer: personalReviewer
  implementer: personalImplementer
attempts:
  proposalReview: 1
  implementation: 1
checks:
  - printf shared-required-check
delivery: local
`;
  writeFile(repo.top, "openspec/loop.local.yaml", shared);
  assert.equal(repo.git("check-ignore", "openspec/loop.local.yaml"), "openspec/loop.local.yaml");
  assert.equal(existsSync(join(issue, "openspec/loop.local.yaml")), false);

  const result = runLoop(repo, ["run", "add-thing"], issue);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /review 1 of 1/);
  assert.match(result.stdout, /attempt 1 of 1/);
  assert.deepEqual(repo.calls("reviewer")[0]!.args.slice(0, 3), ["reviewer", "--model", "personal-review"]);
  assert.deepEqual(repo.calls("implementer")[0]!.args.slice(0, 3), ["implementer", "--model", "personal-implementation"]);
  const transcripts = join(repo.runDir(), "transcripts");
  const checks = readdirSync(transcripts).filter((name) => name.endsWith("-check.log"));
  assert.ok(checks.length > 0);
  for (const name of checks) assert.equal(readFileSync(join(transcripts, name), "utf8"), "shared-required-check");
  assert.equal(readState(repo.runDir())!.worktree, issue);
  assert.equal(readState(repo.runDir())!.stages.delivery, "complete");
  assert.deepEqual(repo.ghCalls(), []);
  assert.equal(readFileSync(join(repo.top, "openspec/loop.local.yaml"), "utf8"), shared);
  assert.equal(existsSync(join(issue, "openspec/loop.local.yaml")), false);
});

test("step from another worktree rereads edited primary settings and keeps the enrolled worktree", (t) => {
  const repo = makeRepo(t);
  appendFileSync(join(repo.top, ".git/info/exclude"), "openspec/loop.local.yaml\n");
  const settings = (value: string) => `agents:
  personal: [stub-agent, implementer, --model, ${value}]
roles:
  implementer: personal
checks:
  - printf ${value}-required-check
`;
  writeFile(repo.top, "openspec/loop.local.yaml", settings("before"));
  repo.queue("implementer", { exit: 3 });
  const stopped = runLoop(repo, ["run", "add-thing"]);
  assert.equal(stopped.status, 1, stopped.stdout + stopped.stderr);
  const enrolled = readState(repo.runDir())!.worktree;
  assert.equal(enrolled, repo.worktree);

  writeFile(repo.top, "openspec/loop.local.yaml", settings("after"));
  const observer = join(repo.root, "observer");
  repo.git("worktree", "add", "--quiet", "-b", "observer", observer);
  const continued = runLoop(repo, ["step", "add-thing"], observer);
  assert.equal(continued.status, 0, continued.stdout + continued.stderr);
  assert.match(continued.stdout, /Next stage: integration/);
  const calls = repo.calls("implementer");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0]!.args.slice(0, 3), ["implementer", "--model", "before"]);
  assert.deepEqual(calls[1]!.args.slice(0, 3), ["implementer", "--model", "after"]);
  assert.equal(calls[1]!.cwd, enrolled);
  const transcripts = join(repo.runDir(), "transcripts");
  const checks = readdirSync(transcripts).filter((name) => name.endsWith("-check.log"));
  assert.equal(checks.length, 1);
  assert.equal(readFileSync(join(transcripts, checks[0]!), "utf8"), "after-required-check");
  assert.equal(readState(repo.runDir())!.worktree, enrolled);
  assert.equal(repo.calls("reviewer").length, 1);
  assert.equal(existsSync(join(observer, "openspec/loop.local.yaml")), false);
});

test("agents named on run apply to the run, are written to the run worktree's local file and are kept by a later resume there", (t) => {
  const repo = makeRepo(t);
  appendFileSync(join(repo.top, ".git/info/exclude"), "openspec/loop.local.yaml\n");
  writeFile(repo.top, "openspec/loop.local.yaml", "agents:\n  alt: [stub-agent, implementer, --model, alt]\n");
  repo.queue("implementer", { exit: 3 });
  const stopped = runLoop(repo, ["run", "add-thing", "reviewer", "reviser", "alt", "verifier"]);
  assert.equal(stopped.status, 1, stopped.stdout + stopped.stderr);
  assert.match(stopped.stdout, /implementer started \(alt\)/);
  assert.equal(
    readFileSync(join(repo.worktree, "openspec/loop.local.yaml"), "utf8"),
    "roles:\n  proposalReviewer: reviewer\n  planReviser: reviser\n  implementer: alt\n  implementationReviewer: verifier\n",
  );

  const resumed = runLoop(repo, ["resume", "add-thing"], repo.worktree);
  assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
  const calls = repo.calls("implementer");
  assert.equal(calls.length, 2);
  for (const call of calls) assert.deepEqual(call.args.slice(0, 3), ["implementer", "--model", "alt"]);
});

test("agents named on the command keep the other content of an existing local file", (t) => {
  const repo = makeRepo(t, { branch: "issue" });
  appendFileSync(join(repo.top, ".git/info/exclude"), "openspec/loop.local.yaml\n");
  writeFile(repo.top, "openspec/loop.local.yaml", "agents:\n  alt: [stub-agent, implementer, --model, alt]\nroles:\n  implementer: implementer\nchecks: []\n");
  const result = runLoop(repo, ["run", "add-thing", "reviewer", "reviser", "alt", "verifier"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    readFileSync(join(repo.top, "openspec/loop.local.yaml"), "utf8"),
    "agents:\n  alt: [stub-agent, implementer, --model, alt]\nroles:\n  implementer: alt\n  proposalReviewer: reviewer\n  planReviser: reviser\n  implementationReviewer: verifier\nchecks: []\n",
  );
});

test("an undefined agent named on the command refuses before anything is written", (t) => {
  const repo = makeRepo(t);
  const result = runLoop(repo, ["run", "add-thing", "reviewer", "reviser", "ghost", "verifier"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /role implementer names agent "ghost", which the configuration does not define/);
  assert.equal(existsSync(repo.worktree), false);
  assert.equal(readState(repo.runDir()), undefined);
});
