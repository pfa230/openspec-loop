import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { loop, makeRepo, runLoop, writeFile } from "./helpers.js";

test("loop prints usage and exits 2", (t) => {
  const repo = makeRepo(t);
  for (const args of [[], ["run"], ["step"], ["unknown", "add-thing"], ["run", "add-thing", "extra"], ["step", "add-thing", "extra"], ["run", "add-thing", "a", "b", "c"],
    ["scope"], ["scope", "start"], ["scope", "finish"], ["scope", "other", "session"], ["scope", "start", "session", "extra"], ["scope", "finish", "session", "--force"]]) {
    const result = loop(args, { cwd: repo.top, env: repo.env });
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /^Usage: loop /);
  }
});

test("status of a change with no run exits 2", (t) => {
  const repo = makeRepo(t);
  const result = runLoop(repo, ["status", "add-thing"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /add-thing has no run; start one with `loop run add-thing`/);
});

test("--attempts and --implement are accepted only on resume, each once, --attempts as a positive integer", (t) => {
  const repo = makeRepo(t);
  const malformed = [
    ["run", "add-thing", "--attempts", "1"],
    ["status", "add-thing", "--attempts", "1"],
    ["step", "add-thing", "--attempts", "1"],
    ["resume", "add-thing", "--attempts"],
    ["resume", "add-thing", "--attempts", "0"],
    ["resume", "add-thing", "--attempts", "1.5"],
    ["resume", "add-thing", "--attempts", "two"],
    ["resume", "add-thing", "--attempts", "9".repeat(400)],
    ["run", "add-thing", "--implement"],
    ["status", "add-thing", "--implement"],
    ["step", "add-thing", "--implement"],
    ["resume", "add-thing", "--implement", "--implement"],
    ["resume", "add-thing", "--attempts", "1", "--attempts", "2"],
  ];
  for (const args of malformed) {
    const result = loop(args, { cwd: repo.top, env: repo.env });
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /^Usage: loop /, args.join(" "));
  }
  for (const extra of [["--attempts", "2"], ["--implement"], ["--implement", "--attempts", "2"], ["--attempts", "2", "--implement"]]) {
    const accepted = runLoop(repo, ["resume", "add-thing", ...extra]);
    assert.equal(accepted.status, 2, extra.join(" "));
    assert.match(accepted.stderr, /add-thing has no run/, extra.join(" "));
  }
});

test("run, step and resume accept four agent aliases, resume also before its options", (t) => {
  const repo = makeRepo(t);
  for (const args of [["run", "add-thing"], ["step", "add-thing"], ["resume", "add-thing"]]) {
    const result = runLoop(repo, [...args, "reviewer", "ghost", "implementer", "verifier", ...(args[0] === "resume" ? ["--attempts", "2"] : [])]);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /role planReviser names agent "ghost", which the configuration does not define/, args.join(" "));
  }
  assert.equal(existsSync(repo.worktree), false);
});

for (const command of ["run", "step"]) {
  test(`${command} refuses a role whose agent cannot be found, naming the role and the alias`, (t) => {
    const repo = makeRepo(t);
    writeFile(repo.top, "openspec/loop.local.yaml", "agents:\n  ghost: [no-such-adapter]\nroles:\n  planReviser: ghost\n");
    const result = runLoop(repo, [command, "add-thing"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /role planReviser uses agent "ghost", whose command no-such-adapter is not an executable file on PATH/);
  });
}
