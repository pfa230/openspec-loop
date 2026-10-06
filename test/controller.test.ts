import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { makeRepo, runLoop, writeFile } from "./helpers.js";

const LINE = /^\[\d{2}:\d{2}:\d{2}\] (.*)$/;

function progressLines(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => LINE.exec(line)?.[1])
    .filter((line): line is string => line !== undefined && !line.startsWith("created branch"));
}

for (const branch of [undefined, "add-thing"]) {
  test(`a run completes through every stage in order and commits the archive (${branch ?? "default-branch path"})`, (t) => {
    const repo = makeRepo(t, { branch });
    const result = runLoop(repo, ["run", "add-thing"]);
    assert.equal(result.status, 0, result.stderr);
    const runBranch = branch ?? "loop/add-thing";
    assert.deepEqual(
      progressLines(result.stdout),
      [
        "proposal-review: review 1 of 3 started (reviewer)",
        "proposal-review: review 1 of 3 APPROVE, 0 blocking, 0 minor (reviewer)",
        "proposal-review: complete",
        "implementation: attempt 1 of 3, implementer started (implementer)",
        "implementation: attempt 1 of 3, implementer made no changes (implementer)",
        "implementation: attempt 1 of 3, review started (verifier)",
        "implementation: attempt 1 of 3, review APPROVE, 0 blocking, 0 minor (verifier)",
        "implementation: complete",
        "integration: started",
        "integration: complete",
        "archive: started",
        `archive: committed ${repo.git("rev-parse", "--short=7", runBranch)}`,
        "archive: complete",
        "delivery: started (fixture)",
        "delivery: complete (fixture)",
      ],
    );
    assert.equal(repo.git("log", "-1", "--format=%s", runBranch), "add-thing: archive");
    assert.deepEqual(repo.git("diff", "--name-status", `${runBranch}~1`, runBranch).split("\n").sort(), [
      "R100\topenspec/changes/add-thing/proposal.md\topenspec/changes/archive/2026-01-01-add-thing/proposal.md",
      "R100\topenspec/changes/add-thing/tasks.md\topenspec/changes/archive/2026-01-01-add-thing/tasks.md",
    ]);
    const worktree = branch ? repo.top : repo.worktree;
    const report = result.stdout.slice(result.stdout.indexOf("Run add-thing completed"));
    assert.equal(
      report,
      "Run add-thing completed. Stage delivery was a fixture and did no real work.\n" +
        `Worktree: ${worktree}\nRun directory: ${repo.runDir()}\nTranscripts: ${join(repo.runDir(), "transcripts")}\n`,
    );
  });
}

test("a failing stage stops the run with a report naming the stage, cause, recovery and locations", (t) => {
  const repo = makeRepo(t);
  repo.queue("implementer", { exit: 3 });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1);
  assert.deepEqual(progressLines(result.stdout), [
    "proposal-review: review 1 of 3 started (reviewer)",
    "proposal-review: review 1 of 3 APPROVE, 0 blocking, 0 minor (reviewer)",
    "proposal-review: complete",
    "implementation: attempt 1 of 3, implementer started (implementer)",
    "implementation: attempt 1 of 3, implementer execution failure, exit status 3 (implementer)",
  ]);
  const dir = repo.runDir();
  const step = join(dir, "transcripts", "002-implementation");
  const report = result.stdout.slice(result.stdout.indexOf("Run add-thing stopped"));
  assert.equal(
    report,
    "Run add-thing stopped at implementation.\n" +
      `Cause: execution failure of implementer agent "implementer": exit status 3\nTranscript: ${step}.log\nReply: ${step}.reply.json\n` +
      "Recovery: loop resume add-thing\n" +
      `Worktree: ${repo.worktree}\nRun directory: ${dir}\nTranscripts: ${join(dir, "transcripts")}\n`,
  );
  assert.match(readFileSync(`${step}.log`, "utf8"), /^stub implementer turn/);
});

test("a step runs in the run's worktree", (t) => {
  const repo = makeRepo(t);
  writeFile(repo.top, "openspec/loop.local.yaml", "checks:\n  - pwd\n");
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 0);
  const transcripts = join(repo.runDir(), "transcripts");
  const checks = readdirSync(transcripts).filter((name) => name.endsWith("-check.log"));
  assert.equal(checks.length, 2);
  for (const check of checks) assert.equal(readFileSync(join(transcripts, check), "utf8"), `${repo.worktree}\n`);
});

test("a repeated stage gets a new transcript", (t) => {
  const repo = makeRepo(t);
  repo.refuseArchive();
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 1);
  assert.equal(runLoop(repo, ["resume", "add-thing"]).status, 1);
  const transcripts = join(repo.runDir(), "transcripts");
  const archives = readdirSync(transcripts).filter((name) => name.endsWith("-archive.log"));
  assert.equal(archives.length, 2);
  assert.notEqual(archives[0], archives[1]);
});

test("run refuses when LOOP_FIXTURE is unset", (t) => {
  const repo = makeRepo(t);
  delete repo.env.LOOP_FIXTURE;
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /stage delivery is not implemented yet; set LOOP_FIXTURE/);
});

test("run refuses a fixture that does not name every stage", (t) => {
  const repo = makeRepo(t);
  repo.setFixture({});
  const path = repo.env.LOOP_FIXTURE!;
  const lines = readFileSync(path, "utf8").split("\n").filter((line) => !line.startsWith("delivery:"));
  writeFileSync(path, lines.join("\n"));
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /names no command for delivery/);
});

test("a refused archive stops the run without a commit, and resume archives once OpenSpec accepts", (t) => {
  const repo = makeRepo(t);
  repo.refuseArchive();
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  const transcript = join(repo.runDir(), "transcripts", readdirSync(join(repo.runDir(), "transcripts")).find((name) => name.endsWith("-archive.log"))!);
  assert.deepEqual(progressLines(result.stdout).slice(-2), ["archive: started", "archive: openspec archive failed, exit status 1"]);
  assert.ok(
    result.stdout.includes(
      "Run add-thing stopped at archive.\n" +
        `Cause: \`openspec archive add-thing\` failed with exit status 1\nTranscript: ${transcript}\n` +
        `Recovery: fix the change in worktree ${repo.worktree}, commit it on branch loop/add-thing, then run \`loop resume add-thing\`\n`,
    ),
    result.stdout,
  );
  assert.match(readFileSync(transcript, "utf8"), /Validation failed/);
  assert.equal(repo.git("rev-parse", "loop/add-thing"), repo.git("rev-parse", "main"));

  repo.refuseArchive(false);
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.equal(progressLines(resumed.stdout)[0], "archive: started");
  assert.equal(repo.git("log", "-1", "--format=%s", "loop/add-thing"), "add-thing: archive");
});

test("a second loop run of the same change is refused", (t) => {
  const repo = makeRepo(t);
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 0);
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /add-thing already has a run; see `loop status add-thing` or continue it with `loop resume add-thing`/);
});

test("a step killed by a signal is an execution failure naming the signal", (t) => {
  const repo = makeRepo(t);
  repo.queue("implementer", { kill: true });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Cause: execution failure of implementer agent "implementer": signal SIGKILL\n/);
});

test("a run stopped after archival resumes to completion although the change directory has moved", (t) => {
  const repo = makeRepo(t, { fixture: { delivery: "exit 1" } });
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 1);
  repo.setFixture({});
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.deepEqual(progressLines(resumed.stdout), ["delivery: started (fixture)", "delivery: complete (fixture)"]);
});
