import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";
import { isAlive, readState } from "../src/state.js";
import { configYaml, makeRepo, type Repo, runLoop, startLoop, writeFile } from "./helpers.js";

// A killed process stays visible until its parent reaps it, so wait for it to go.
async function gone(pid: number): Promise<boolean> {
  const deadline = Date.now() + 2_000;
  while (isAlive(pid)) {
    if (Date.now() > deadline) return false;
    await sleep(25);
  }
  return true;
}

// A required check whose shell, the process group leader, waits on a child process.
// Both record their PIDs, so a test can check that stopping ends the whole group.
function sleepingStep(repo: Repo) {
  const read = (name: string) => () => {
    const path = join(repo.root, name);
    return existsSync(path) ? Number(readFileSync(path, "utf8")) : 0;
  };
  const pid = read("step.pid");
  const child = read("child.pid");
  return {
    command: `echo $$ > ${join(repo.root, "step.pid")}; sleep 30 & echo $! > ${join(repo.root, "child.pid")}; wait`,
    // Makes the step the run's only required check, or with false, leaves the run no checks.
    use(on = true) {
      writeFile(repo.top, "openspec/loop.local.yaml", on ? `checks:\n  - ${JSON.stringify(this.command)}\n` : "checks: []\n");
    },
    pid,
    child,
    async started() {
      const deadline = Date.now() + 10_000;
      while (!(pid() > 0 && child() > 0)) {
        if (Date.now() > deadline) throw new Error("the check did not start");
        await sleep(25);
      }
    },
  };
}

// A run stopped at archive, with OpenSpec accepting the archive again.
function stoppedAtArchive(t: Parameters<typeof makeRepo>[0]): Repo {
  const repo = makeRepo(t);
  repo.refuseArchive();
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 1);
  repo.refuseArchive(false);
  return repo;
}

test("resume after a failure reruns only the failed stage and later ones", (t) => {
  const repo = stoppedAtArchive(t);
  const result = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /\] (proposal-review|implementation|integration):/);
  assert.match(result.stdout, /\] archive: started/);
  assert.match(result.stdout, /Run add-thing completed/);
});

test("resume reads the configuration again", (t) => {
  const repo = stoppedAtArchive(t);
  writeFile(repo.top, "openspec/loop.yaml", `${configYaml()}remote: origin\n`);
  const refused = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /unknown key "remote"/);
  writeFile(repo.top, "openspec/loop.yaml", configYaml());
  assert.equal(runLoop(repo, ["resume", "add-thing"]).status, 0);
});

test("a resumed run keeps its worktree after the worktrees directory changes", (t) => {
  const repo = stoppedAtArchive(t);
  writeFile(repo.top, "openspec/loop.yaml", configYaml().replace("worktrees: .worktrees", "worktrees: elsewhere"));
  const result = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(repo.gitIn(repo.worktree, "log", "-1", "--format=%s"), "add-thing: archive");
  assert.equal(existsSync(join(repo.top, "elsewhere")), false);
});

test("resume works from another checkout of the repository", (t) => {
  const repo = stoppedAtArchive(t);
  const result = runLoop(repo, ["resume", "add-thing"], repo.worktree);
  assert.equal(result.status, 0, result.stderr);
});

test("resume of a completed run reports it complete", (t) => {
  const repo = makeRepo(t);
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 0);
  const result = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^Run add-thing completed\.\n/);
});

for (const command of ["run", "step"]) {
  test(`${command}: a second advancement is refused while one is live, and stop ends the worker at once`, async (t) => {
    const repo = makeRepo(t);
    if (command === "step") assert.equal(runLoop(repo, ["step", "add-thing"]).status, 0);
    const step = sleepingStep(repo);
    step.use();
    const running = startLoop(repo, [command, "add-thing"]);
    await running.waitFor(/check .* started/);
    await step.started();

    const status = runLoop(repo, ["status", "add-thing"]);
    assert.match(status.stdout, new RegExp(`^Run add-thing: advancing in process ${running.child.pid}, at implementation`));
    const advancing = runLoop(repo, ["status", "add-thing", "--json"]);
    assert.equal(advancing.status, 0, advancing.stderr);
    const observation = JSON.parse(advancing.stdout);
    assert.deepEqual(observation, {
      version: 1, status: "advancing", branch: "loop/add-thing", worktree: repo.worktree, report: observation.report,
    });
    assert.match(observation.report, new RegExp(`^Run add-thing: advancing in process ${running.child.pid}, at implementation`));

    for (const other of ["run", "resume", "step"]) {
      const refused = runLoop(repo, [other, "add-thing"]);
      assert.equal(refused.status, 2);
      assert.match(refused.stderr, new RegExp(`already advancing in process ${running.child.pid}`));
    }

    const started = Date.now();
    const stopped = runLoop(repo, ["stop", "add-thing"], repo.worktree);
    assert.equal(stopped.status, 0);
    assert.equal(stopped.stdout, "Stopped run add-thing.\n");
    const result = await running.exited;
    assert.ok(Date.now() - started < 5_000);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\] implementation: attempt 1 of 3, check `.*` stopped by the user\n/);
    assert.match(result.stdout, /Cause: stopped by the user\nRecovery: loop resume add-thing\n/);
    assert.ok(await gone(step.pid()));
    assert.ok(await gone(step.child()));

    const statusAfter = runLoop(repo, ["status", "add-thing"]);
    assert.match(statusAfter.stdout, /^Run add-thing: stopped at implementation\nCause: stopped by the user\nRecovery: loop resume add-thing\n/);
    assert.match(statusAfter.stdout, /\n {2}proposal-review {2}complete\n {2}implementation {3}pending\n/);
    const stoppedStatus = runLoop(repo, ["status", "add-thing", "--json"]);
    assert.equal(stoppedStatus.status, 0, stoppedStatus.stderr);
    assert.deepEqual(JSON.parse(stoppedStatus.stdout), {
      version: 1, status: "stopped", branch: "loop/add-thing", worktree: repo.worktree, report: statusAfter.stdout,
    });
    assert.equal(runLoop(repo, ["stop", "add-thing"]).stdout, "Run add-thing is not advancing.\n");

    step.use(false);
    const resumed = runLoop(repo, [command === "step" ? "step" : "resume", "add-thing"]);
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.match(resumed.stdout, /^\[[\d:]+\] implementation: attempt 1 of 3, implementer started/);
  });

  for (const signal of ["SIGINT", "SIGHUP"] as const) {
    test(`${signal} to loop ${command} stops the run like loop stop`, async (t) => {
      const repo = makeRepo(t);
      if (command === "step") assert.equal(runLoop(repo, ["step", "add-thing"]).status, 0);
      const step = sleepingStep(repo);
      step.use();
      const running = startLoop(repo, [command, "add-thing"]);
      await running.waitFor(/check .* started/);
      await step.started();
      running.child.kill(signal);
      const result = await running.exited;
      assert.equal(result.status, 1);
      assert.match(result.stdout, /Cause: stopped by the user\n/);
      assert.ok(await gone(step.pid()));
      assert.ok(await gone(step.child()));
    });
  }

  test(`${command}: a dead controller shows as interrupted and recovery redoes its worker`, async (t) => {
    const repo = makeRepo(t);
    if (command === "step") assert.equal(runLoop(repo, ["step", "add-thing"]).status, 0);
    const step = sleepingStep(repo);
    step.use();
    const running = startLoop(repo, [command, "add-thing"]);
    await running.waitFor(/check .* started/);
    await step.started();
    const controller = running.child.pid!;
    // Freeze the controller first, so it cannot record the step's death before it dies too.
    process.kill(controller, "SIGSTOP");
    process.kill(-step.pid(), "SIGKILL");
    running.child.kill("SIGKILL");
    await running.exited;
    // A killed group reads as alive until its processes are reaped.
    assert.ok(await gone(step.pid()));
    assert.ok(await gone(step.child()));

    const status = runLoop(repo, ["status", "add-thing"]);
    assert.match(
      status.stdout,
      new RegExp(`^Run add-thing: interrupted at implementation; process ${controller} died\nRecovery: loop resume add-thing\n`),
    );
    const interrupted = runLoop(repo, ["status", "add-thing", "--json"]);
    assert.equal(interrupted.status, 0, interrupted.stderr);
    assert.deepEqual(JSON.parse(interrupted.stdout), {
      version: 1, status: "interrupted", branch: "loop/add-thing", worktree: repo.worktree, report: status.stdout,
    });

    step.use(false);
    const resumed = runLoop(repo, [command === "step" ? "step" : "resume", "add-thing"]);
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.match(resumed.stdout, new RegExp(`took over run add-thing from process ${controller}, which died\n`));
    assert.match(resumed.stdout, /\] implementation: attempt 1 of 3, implementer started/);
  });

  test(`${command}: recovery refuses a surviving worker and takes over once it ends`, async (t) => {
    const repo = makeRepo(t);
    if (command === "step") assert.equal(runLoop(repo, ["step", "add-thing"]).status, 0);
    const step = sleepingStep(repo);
    step.use();
    const running = startLoop(repo, [command, "add-thing"]);
    await running.waitFor(/check .* started/);
    await step.started();
    const deadline = Date.now() + 10_000;
    while (readState(repo.runDir())?.stepGroup !== step.pid()) {
      assert.ok(Date.now() < deadline, "the step's group was not recorded");
      await sleep(25);
    }
    const controller = running.child.pid!;
    running.child.kill("SIGKILL");
    await running.exited;
    // With its leader gone, the group lives on in the leader's child, as a harness outlives its wrapper.
    process.kill(step.pid(), "SIGKILL");
    assert.ok(await gone(step.pid()));

    step.use(false);
    for (const recovery of ["resume", "step"]) {
      const refused = runLoop(repo, [recovery, "add-thing"]);
      assert.equal(refused.status, 2);
      assert.match(refused.stderr, new RegExp(`process group ${step.pid()}, started by process ${controller}, which died`));
    }
    assert.ok(isAlive(step.child()));
    const status = runLoop(repo, ["status", "add-thing"]);
    assert.match(status.stdout, new RegExp(`^Run add-thing: interrupted at implementation; process ${controller} died\n`));

    process.kill(-step.pid(), "SIGKILL");
    assert.ok(await gone(step.child()));
    const resumed = runLoop(repo, [command === "step" ? "step" : "resume", "add-thing"]);
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.match(resumed.stdout, new RegExp(`took over run add-thing from process ${controller}, which died\n`));
  });
}
