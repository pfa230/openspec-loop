import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Refusal } from "../src/refusal.js";
import { acquireLock, releaseLock } from "../src/state.js";
import { makeRepo, runLoop } from "./helpers.js";

function runDirectory(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), "loop-state-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("a lock held by a live process is refused, naming its PID", (t) => {
  const dir = runDirectory(t);
  const holder = spawn("sleep", ["30"]);
  t.after(() => holder.kill());
  writeFileSync(join(dir, "lock"), String(holder.pid));
  assert.throws(
    () => acquireLock(dir, "add-thing"),
    (error: unknown) => error instanceof Refusal && error.message.includes(`already advancing in process ${holder.pid}`),
  );
});

test("a lock naming a dead process is taken over", (t) => {
  const dir = runDirectory(t);
  const dead = spawnSync("true").pid;
  writeFileSync(join(dir, "lock"), String(dead));
  assert.equal(acquireLock(dir, "add-thing"), dead);
  assert.equal(readFileSync(join(dir, "lock"), "utf8"), String(process.pid));
  releaseLock(dir);
});

test("status given from another worktree of the repository finds the run", (t) => {
  const repo = makeRepo(t);
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 0);
  const other = join(repo.root, "other");
  repo.git("worktree", "add", "--quiet", "-b", "other", other);
  const result = runLoop(repo, ["status", "add-thing"], other);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Run add-thing: complete/);
});
