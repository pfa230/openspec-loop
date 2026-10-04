import assert from "node:assert/strict";
import { test } from "node:test";
import { loop, makeRepo, runLoop } from "./helpers.js";

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
