import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";
import { isAlive } from "../src/state.js";
import { makeRepo, type Repo, runLoop, startLoop, writeFile } from "./helpers.js";

// A fixture step that records its PID, which is also its process group, and then sleeps.
function sleepingStep(repo: Repo) {
  const pidFile = join(repo.root, "step.pid");
  const pid = () => (existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8")) : 0);
  return {
    command: `echo $$ > ${pidFile}; exec sleep 30`,
    pid,
    async started() {
      const deadline = Date.now() + 10_000;
      while (!(pid() > 0)) {
        if (Date.now() > deadline) throw new Error("the fixture step did not start");
        await sleep(25);
      }
    },
  };
}

test("resume after a failure reruns only the failed stage and later ones", (t) => {
  const repo = makeRepo(t, { fixture: { implementation: "exit 1" } });
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 1);
  repo.setFixture({});
  const result = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /proposal-review/);
  assert.match(result.stdout, /\] implementation: started \(fixture\)/);
  assert.match(result.stdout, /Run add-thing completed/);
});

test("resume reads the configuration again", (t) => {
  const repo = makeRepo(t, { fixture: { implementation: "exit 1" } });
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 1);
  repo.setFixture({});
  writeFile(repo.top, "openspec/loop.yaml", "defaultBranch: main\ndelivery: merge\n");
  const refused = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /unknown key "delivery"/);
  writeFile(repo.top, "openspec/loop.yaml", "defaultBranch: main\n");
  assert.equal(runLoop(repo, ["resume", "add-thing"]).status, 0);
});

test("resume works from another checkout of the repository", (t) => {
  const repo = makeRepo(t, { fixture: { implementation: "exit 1" } });
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 1);
  repo.setFixture({});
  const result = runLoop(repo, ["resume", "add-thing"], join(repo.runDir(), "worktree"));
  assert.equal(result.status, 0, result.stderr);
});

test("resume of a completed run reports it complete", (t) => {
  const repo = makeRepo(t);
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 0);
  const result = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^Run add-thing is complete\./);
});

test("a second advancement is refused while one is live, and stop ends the step at once", async (t) => {
  const repo = makeRepo(t);
  const step = sleepingStep(repo);
  repo.setFixture({ implementation: step.command });
  const running = startLoop(repo, ["run", "add-thing"]);
  await running.waitFor(/implementation: started/);
  await step.started();

  const status = runLoop(repo, ["status", "add-thing"]);
  assert.match(status.stdout, new RegExp(`^Run add-thing: advancing in process ${running.child.pid}, at implementation`));

  const refused = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, new RegExp(`already advancing in process ${running.child.pid}`));

  const started = Date.now();
  const stopped = runLoop(repo, ["stop", "add-thing"], join(repo.runDir(), "worktree"));
  assert.equal(stopped.status, 0);
  assert.equal(stopped.stdout, "Stopped run add-thing.\n");
  const result = await running.exited;
  assert.ok(Date.now() - started < 5_000);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\] implementation: stopped by the user \(fixture\)\n/);
  assert.match(result.stdout, /Cause: stopped by the user\nRecovery: loop resume add-thing\n/);
  assert.equal(isAlive(step.pid()), false);

  const statusAfter = runLoop(repo, ["status", "add-thing"]);
  assert.match(statusAfter.stdout, /^Run add-thing: stopped at implementation\nCause: stopped by the user\nRecovery: loop resume add-thing\n/);
  assert.match(statusAfter.stdout, /\n {2}proposal-review {2}complete\n {2}implementation {3}pending\n/);
  assert.equal(runLoop(repo, ["stop", "add-thing"]).stdout, "Run add-thing is not advancing.\n");

  repo.setFixture({});
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.match(resumed.stdout, /^\[[\d:]+\] implementation: started \(fixture\)/);
});

for (const signal of ["SIGINT", "SIGHUP"] as const) {
  test(`${signal} to loop run stops the run like loop stop`, async (t) => {
    const repo = makeRepo(t);
    const step = sleepingStep(repo);
    repo.setFixture({ implementation: step.command });
    const running = startLoop(repo, ["run", "add-thing"]);
    await running.waitFor(/implementation: started/);
    await step.started();
    running.child.kill(signal);
    const result = await running.exited;
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Cause: stopped by the user\n/);
    assert.equal(isAlive(step.pid()), false);
  });
}

test("a run whose controller died with its step shows as interrupted, and resume redoes the step", async (t) => {
  const repo = makeRepo(t);
  const step = sleepingStep(repo);
  repo.setFixture({ implementation: step.command });
  const running = startLoop(repo, ["run", "add-thing"]);
  await running.waitFor(/implementation: started/);
  await step.started();
  const controller = running.child.pid!;
  process.kill(-step.pid(), "SIGKILL");
  running.child.kill("SIGKILL");
  await running.exited;

  const status = runLoop(repo, ["status", "add-thing"]);
  assert.match(
    status.stdout,
    new RegExp(`^Run add-thing: interrupted at implementation; process ${controller} died\nRecovery: loop resume add-thing\n`),
  );

  repo.setFixture({});
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.match(resumed.stdout, new RegExp(`took over run add-thing from process ${controller}, which died\n`));
  assert.match(resumed.stdout, /\] implementation: started \(fixture\)/);
});
