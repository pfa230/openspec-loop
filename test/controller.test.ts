import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { FIXTURE_STAGES, makeRepo, runLoop } from "./helpers.js";

const LINE = /^\[\d{2}:\d{2}:\d{2}\] (.*)$/;

function progressLines(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => LINE.exec(line)?.[1])
    .filter((line): line is string => line !== undefined && !line.startsWith("created branch"));
}

for (const branch of [undefined, "add-thing"]) {
  test(`a fixture run completes through every stage in order (${branch ?? "default-branch path"})`, (t) => {
    const repo = makeRepo(t, { branch });
    const result = runLoop(repo, ["run", "add-thing"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      progressLines(result.stdout),
      [
        "proposal-review: review 1 of 3 started (reviewer)",
        "proposal-review: review 1 of 3 APPROVE, 0 blocking, 0 minor (reviewer)",
        "proposal-review: complete",
        ...FIXTURE_STAGES.flatMap((stage) => [`${stage}: started (fixture)`, `${stage}: complete (fixture)`]),
      ],
    );
    const worktree = branch ? repo.top : repo.worktree;
    const report = result.stdout.slice(result.stdout.indexOf("Run add-thing completed"));
    assert.equal(
      report,
      "Run add-thing completed. Stages implementation, integration, archive and delivery were fixtures and did no real work.\n" +
        `Worktree: ${worktree}\nRun directory: ${repo.runDir()}\nTranscripts: ${join(repo.runDir(), "transcripts")}\n`,
    );
  });
}

test("a failing stage stops the run with a report naming the stage, cause, recovery and locations", (t) => {
  const repo = makeRepo(t, { fixture: { implementation: "echo boom; exit 3" } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1);
  assert.deepEqual(progressLines(result.stdout), [
    "proposal-review: review 1 of 3 started (reviewer)",
    "proposal-review: review 1 of 3 APPROVE, 0 blocking, 0 minor (reviewer)",
    "proposal-review: complete",
    "implementation: started (fixture)",
    "implementation: execution failure, exit status 3 (fixture)",
  ]);
  const dir = repo.runDir();
  const report = result.stdout.slice(result.stdout.indexOf("Run add-thing stopped"));
  assert.equal(
    report,
    "Run add-thing stopped at implementation.\nCause: execution failure, exit status 3 (fixture)\n" +
      "Recovery: loop resume add-thing\n" +
      `Worktree: ${repo.worktree}\nRun directory: ${dir}\nTranscripts: ${join(dir, "transcripts")}\n`,
  );
  assert.equal(readFileSync(join(dir, "transcripts", "002-implementation.log"), "utf8"), "boom\n");
});

test("a step runs in the run's worktree", (t) => {
  const repo = makeRepo(t, { fixture: { implementation: "pwd" } });
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 0);
  const dir = repo.runDir();
  assert.equal(readFileSync(join(dir, "transcripts", "002-implementation.log"), "utf8"), `${repo.worktree}\n`);
});

test("a repeated stage gets a new transcript", (t) => {
  const repo = makeRepo(t, { fixture: { implementation: "echo first; exit 1" } });
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 1);
  repo.setFixture({ implementation: "echo second" });
  assert.equal(runLoop(repo, ["resume", "add-thing"]).status, 0);
  const transcripts = join(repo.runDir(), "transcripts");
  assert.deepEqual(readdirSync(transcripts).filter((name) => name.endsWith("-implementation.log")), [
    "002-implementation.log",
    "003-implementation.log",
  ]);
  assert.equal(readFileSync(join(transcripts, "003-implementation.log"), "utf8"), "second\n");
});

test("run refuses when LOOP_FIXTURE is unset", (t) => {
  const repo = makeRepo(t);
  delete repo.env.LOOP_FIXTURE;
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /stages implementation, integration, archive and delivery are not implemented yet; set LOOP_FIXTURE/);
});

test("run refuses a fixture that does not name every stage", (t) => {
  const repo = makeRepo(t);
  repo.setFixture({});
  const path = repo.env.LOOP_FIXTURE!;
  const lines = readFileSync(path, "utf8").split("\n").filter((line) => !line.startsWith("archive:"));
  writeFileSync(path, lines.join("\n"));
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /names no command for archive/);
});

test("a second loop run of the same change is refused", (t) => {
  const repo = makeRepo(t);
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 0);
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /add-thing already has a run; see `loop status add-thing` or continue it with `loop resume add-thing`/);
});

test("a step killed by a signal is an execution failure naming the signal", (t) => {
  const repo = makeRepo(t, { fixture: { implementation: "kill -KILL $$" } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Cause: execution failure, signal SIGKILL \(fixture\)/);
});
