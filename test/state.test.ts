import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { makeRepo, runLoop } from "./helpers.js";

test("status given from another worktree of the repository finds the run", (t) => {
  const repo = makeRepo(t);
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 0);
  const other = join(repo.root, "other");
  repo.git("worktree", "add", "--quiet", "-b", "other", other);
  const result = runLoop(repo, ["status", "add-thing"], other);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Run add-thing: complete\. Stages integration and delivery were fixtures and did no real work\.\n/);
});
