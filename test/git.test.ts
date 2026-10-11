import assert from "node:assert/strict";
import { readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { primaryCheckout } from "../src/git.js";
import { Refusal } from "../src/refusal.js";
import { makeRepo } from "./helpers.js";

test("primary checkout discovery handles quoted paths and ignores the checked-out branch", (t) => {
  const repo = makeRepo(t);
  const primary = join(repo.root, 'main with spaces\n"quotes"');
  renameSync(repo.top, primary);
  const issue = join(repo.root, "issue");
  repo.gitIn(primary, "worktree", "add", "--quiet", "-b", "issue", issue);
  assert.equal(primaryCheckout(primary), primary);
  assert.equal(primaryCheckout(issue), primary);
  repo.gitIn(primary, "switch", "--quiet", "--detach");
  assert.equal(primaryCheckout(issue), primary);
});

test("a linked worktree of a bare clone has no primary checkout", (t) => {
  const repo = makeRepo(t);
  const origin = repo.addOrigin();
  const issue = join(repo.root, "issue");
  repo.gitIn(repo.root, "--git-dir", origin, "worktree", "add", "--quiet", "-b", "issue", issue, "main");
  assert.equal(primaryCheckout(issue), null);
});

test("separated metadata supports the primary checkout and refuses an unresolvable linked checkout", (t) => {
  const repo = makeRepo(t);
  const metadata = join(repo.root, "metadata");
  repo.git("init", "--quiet", "--separate-git-dir", metadata);
  const issue = join(repo.root, "issue");
  repo.git("worktree", "add", "--quiet", "-b", "issue", issue);
  const before = readFileSync(join(metadata, "config"), "utf8");
  assert.equal(primaryCheckout(repo.top), repo.top);
  assert.throws(() => primaryCheckout(issue), (error: unknown) =>
    error instanceof Refusal && error.message.includes(`cannot locate or access main checkout at ${metadata}`));
  assert.equal(readFileSync(join(metadata, "config"), "utf8"), before);
});
