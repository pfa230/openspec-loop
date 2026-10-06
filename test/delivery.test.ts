import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { makeRepo, runLoop } from "./helpers.js";

test("merge mode without an upstream is refused before a run exists, and runs once one is set", (t) => {
  const repo = makeRepo(t, { delivery: "merge" });
  const refused = runLoop(repo, ["run", "add-thing"]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /default branch main has no upstream; set one with `git branch --set-upstream-to=<remote>\/main main`/);
  assert.equal(existsSync(repo.runDir()), false);
  repo.addOrigin();
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
