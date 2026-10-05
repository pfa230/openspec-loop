import assert from "node:assert/strict";
import { test } from "node:test";
import { loop, makeRepo, runLoop, writeFile } from "./helpers.js";

test("loop prints usage and exits 2", (t) => {
  const repo = makeRepo(t);
  for (const args of [[], ["run"], ["unknown", "add-thing"], ["run", "add-thing", "extra"]]) {
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

test("--attempts is accepted only on resume, as a positive integer", (t) => {
  const repo = makeRepo(t);
  const malformed = [
    ["run", "add-thing", "--attempts", "1"],
    ["status", "add-thing", "--attempts", "1"],
    ["resume", "add-thing", "--attempts"],
    ["resume", "add-thing", "--attempts", "0"],
    ["resume", "add-thing", "--attempts", "1.5"],
    ["resume", "add-thing", "--attempts", "two"],
    ["resume", "add-thing", "--attempts", "9".repeat(400)],
  ];
  for (const args of malformed) {
    const result = loop(args, { cwd: repo.top, env: repo.env });
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /^Usage: loop /, args.join(" "));
  }
  const accepted = runLoop(repo, ["resume", "add-thing", "--attempts", "2"]);
  assert.equal(accepted.status, 2);
  assert.match(accepted.stderr, /add-thing has no run/);
});

test("run refuses a role whose agent cannot be found, naming the role and the alias", (t) => {
  const repo = makeRepo(t);
  writeFile(repo.top, "openspec/loop.local.yaml", "agents:\n  ghost: [no-such-adapter]\nroles:\n  planReviser: ghost\n");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /role planReviser uses agent "ghost", whose command no-such-adapter is not an executable file on PATH/);
});
