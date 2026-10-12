import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { makeRepo, type Repo, runLoop, writeFile } from "./helpers.js";

for (const command of ["run", "step"]) {
  test(`${command}: merge mode without an upstream is refused before a run exists, and runs once one is set`, (t) => {
    const repo = makeRepo(t, { delivery: "merge" });
    const refused = runLoop(repo, [command, "add-thing"]);
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /default branch main has no upstream; set one with `git branch --set-upstream-to=<remote>\/main main`/);
    assert.equal(existsSync(repo.runDir()), false);
    repo.addOrigin();
    const result = runLoop(repo, [command, "add-thing"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
}

// The commit origin's branch points at, or "" when origin lacks the branch.
function remoteTip(repo: Repo, branch: string): string {
  return repo.git("ls-remote", "origin", `refs/heads/${branch}`).split("\t")[0];
}

// A run stopped at archive after integration, with OpenSpec accepting the archive again.
function stoppedAtArchive(repo: Repo): void {
  repo.refuseArchive();
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 1);
  repo.refuseArchive(false);
}

test("local mode pushes nothing and leaves the default branch alone", (t) => {
  const repo = makeRepo(t);
  repo.addOrigin();
  const main = repo.git("rev-parse", "main");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  assert.ok(result.stdout.includes("] delivery: local, nothing pushed\n"), result.stdout);
  assert.equal(repo.git("rev-parse", "main"), main);
  assert.equal(remoteTip(repo, "main"), main);
  assert.equal(remoteTip(repo, "loop/add-thing"), "");
});

test("pr mode pushes the branch without an upstream and opens a pull request described by the proposal", (t) => {
  const repo = makeRepo(t, { delivery: "pr" });
  // An archived change whose name ends like this one's must not supply the body.
  writeFile(repo.top, "openspec/changes/archive/2026-12-31-other-add-thing/proposal.md", "## Why\n\nOther.\n");
  repo.git("add", ".");
  repo.git("commit", "--quiet", "-m", "other change");
  const origin = repo.addOrigin();
  const main = repo.git("rev-parse", "main");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const tip = repo.git("rev-parse", "loop/add-thing");
  assert.ok(result.stdout.includes(`] delivery: pushed loop/add-thing to origin at ${tip.slice(0, 7)}\n`), result.stdout);
  assert.ok(result.stdout.includes("] delivery: opened pull request https://github.com/test/repo/pull/1\n"), result.stdout);
  assert.equal(remoteTip(repo, "loop/add-thing"), tip);
  assert.throws(() => repo.git("config", "--get", "branch.loop/add-thing.remote"));
  const proposal = join(repo.worktree, "openspec/changes/archive/2026-01-01-add-thing/proposal.md");
  assert.deepEqual(repo.ghCalls(), [
    ["pr", "list", "--repo", origin, "--head", "loop/add-thing", "--base", "main", "--state", "open", "--json", "url", "--jq", ".[].url"],
    ["pr", "create", "--repo", origin, "--base", "main", "--head", "loop/add-thing", "--title", "add-thing", "--body-file", proposal],
  ]);
  assert.equal(repo.git("rev-parse", "main"), main);
});

test("pr mode publishes nothing through archival and pushes only at delivery", (t) => {
  const repo = makeRepo(t, { delivery: "pr" });
  repo.addOrigin();
  const main = remoteTip(repo, "main");
  for (const stage of ["proposal-review", "implementation", "integration", "archive"]) {
    const result = runLoop(repo, ["step", "add-thing"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(result.stdout.includes(`] ${stage}: complete\n`), result.stdout);
    assert.equal(remoteTip(repo, "loop/add-thing"), "");
    assert.equal(remoteTip(repo, "main"), main);
    assert.deepEqual(repo.ghCalls(), []);
  }
  assert.equal(repo.gitIn(repo.worktree, "log", "-1", "--format=%s"), "add-thing: archive");
  const result = runLoop(repo, ["step", "add-thing"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(remoteTip(repo, "loop/add-thing"), repo.gitIn(repo.worktree, "rev-parse", "HEAD"));
  assert.ok(result.stdout.includes("] delivery: opened pull request https://github.com/test/repo/pull/1\n"), result.stdout);
  assert.deepEqual(repo.ghCalls().map((args) => args[1]), ["list", "create"]);
});

test("pr mode stops when rebasing an already-pushed user branch rejects delivery, and resumes after reconciliation", (t) => {
  const repo = makeRepo(t, { delivery: "pr", branch: "feature" });
  const origin = repo.addOrigin();
  repo.git("push", "--quiet", "origin", "feature");
  const published = remoteTip(repo, "feature");
  const main = repo.git("rev-parse", "main");
  const other = join(repo.root, "other");
  repo.gitIn(repo.root, "clone", "--quiet", origin, other);
  writeFile(other, "base.txt", "moved\n");
  repo.gitIn(other, "add", "base.txt");
  repo.gitIn(other, "commit", "--quiet", "-m", "move the remote base");
  repo.gitIn(other, "push", "--quiet", "origin", "main");
  const base = remoteTip(repo, "main");
  repo.queue("implementer", { edits: { "a.txt": "a\n" } });

  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(result.stdout.includes(`] integration: rebased onto origin/main at ${base.slice(0, 7)}\n`), result.stdout);
  assert.throws(() => repo.git("merge-base", "--is-ancestor", published, "feature"));
  assert.match(result.stdout, /Run add-thing stopped at delivery\.\nCause: `git push --quiet origin feature:refs\/heads\/feature` failed with exit status 1:\n(.*\n)*.*\[rejected\]/);
  assert.match(result.stdout, /Recovery: loop resume add-thing\n/);
  const transcript = /Transcript: (.+)/.exec(result.stdout)![1];
  assert.match(readFileSync(transcript, "utf8"), /\[rejected\]/);
  assert.equal(remoteTip(repo, "feature"), published);
  assert.equal(remoteTip(repo, "main"), base);
  assert.equal(repo.git("rev-parse", "main"), main);
  assert.deepEqual(repo.ghCalls(), []);

  // The published branch holds only the superseded plan: keep the archived tree while restoring its ancestry.
  repo.git("fetch", "--quiet", "origin", "feature");
  repo.git("merge", "--quiet", "--no-edit", "-s", "ours", "origin/feature");
  const calls = repo.calls().length;
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
  assert.doesNotMatch(resumed.stdout, /\] (proposal-review|implementation|integration|archive): started/);
  assert.equal(repo.calls().length, calls);
  assert.equal(remoteTip(repo, "feature"), repo.git("rev-parse", "feature"));
  assert.equal(repo.git("merge-base", "--is-ancestor", published, "feature"), "");
  assert.equal(repo.git("rev-parse", "main"), main);
  assert.deepEqual(repo.ghCalls().map((args) => args[1]), ["list", "create"]);
});

test("merge mode pushes the change to the remote's default branch and fast-forwards the local one", (t) => {
  const repo = makeRepo(t, { delivery: "merge" });
  repo.addOrigin();
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const tip = repo.git("rev-parse", "loop/add-thing");
  assert.equal(remoteTip(repo, "main"), tip);
  assert.equal(repo.git("rev-parse", "main"), tip);
  assert.ok(existsSync(join(repo.top, "openspec/changes/archive/2026-01-01-add-thing/proposal.md")));
});

test("a rejected push stops merge delivery and leaves the local default branch alone", (t) => {
  const repo = makeRepo(t, { delivery: "merge" });
  const origin = repo.addOrigin();
  stoppedAtArchive(repo);
  const other = join(repo.root, "other");
  repo.gitIn(repo.root, "clone", "--quiet", origin, other);
  repo.gitIn(other, "commit", "--quiet", "--allow-empty", "-m", "elsewhere");
  repo.gitIn(other, "push", "--quiet", "origin", "HEAD:main");
  const main = repo.git("rev-parse", "main");
  const result = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Run add-thing stopped at delivery\.\nCause: `git push --quiet origin HEAD:refs\/heads\/main` failed with exit status 1:\n(.*\n)*.*\[rejected\]/);
  assert.match(result.stdout, /Recovery: bring main from origin into branch loop\/add-thing in worktree .*, then run `loop resume add-thing`\n/);
  assert.equal(repo.git("rev-parse", "main"), main);
  repo.gitIn(repo.worktree, "pull", "--quiet", "--no-rebase", "--no-edit", "origin", "main");
  assert.equal(runLoop(repo, ["resume", "add-thing"]).status, 0);
  assert.equal(repo.git("rev-parse", "main"), remoteTip(repo, "main"));
});

test("merge delivery stops before pushing when the default branch's checkout is dirty, and resumes once it is clean", (t) => {
  const repo = makeRepo(t, { delivery: "merge" });
  repo.addOrigin();
  stoppedAtArchive(repo);
  const before = remoteTip(repo, "main");
  writeFile(repo.top, "openspec/loop.yaml", `${readFileSync(join(repo.top, "openspec/loop.yaml"), "utf8")}# edited\n`);
  const result = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  assert.ok(result.stdout.includes(`Run add-thing stopped at delivery.\nCause: checkout ${repo.top} holds main with uncommitted changes\n`), result.stdout);
  assert.equal(remoteTip(repo, "main"), before);
  repo.git("checkout", "--", "openspec/loop.yaml");
  assert.equal(runLoop(repo, ["resume", "add-thing"]).status, 0);
  assert.equal(remoteTip(repo, "main"), repo.git("rev-parse", "loop/add-thing"));
});

test("merge delivery stops before pushing when the default branch has commits the change lacks", (t) => {
  const repo = makeRepo(t, { delivery: "merge" });
  repo.addOrigin();
  stoppedAtArchive(repo);
  const before = remoteTip(repo, "main");
  repo.git("commit", "--quiet", "--allow-empty", "-m", "local");
  const result = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Cause: main has commits that branch loop\/add-thing lacks\nRecovery: bring main into branch loop\/add-thing in worktree .*, then run `loop resume add-thing`\n/);
  assert.equal(remoteTip(repo, "main"), before);
});

test("an ignored file in the fast-forward's way survives, and the run stops at delivery", (t) => {
  const repo = makeRepo(t, { delivery: "merge" });
  repo.addOrigin();
  repo.queue("implementer", { edits: { "a.txt": "a\n" } });
  // An untracked .gitignore ignores a.txt in the main checkout only; info/exclude would reach the run's worktree too.
  writeFile(repo.top, ".gitignore", "a.txt\n");
  writeFile(repo.top, "a.txt", "mine\n");
  const main = repo.git("rev-parse", "main");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  assert.ok(result.stdout.includes("] delivery: fast-forward of main failed\n"), result.stdout);
  assert.ok(result.stdout.includes(`Cause: fast-forwarding main to ${repo.git("rev-parse", "--short=7", "loop/add-thing")} in checkout ${repo.top} failed: `), result.stdout);
  assert.equal(readFileSync(join(repo.top, "a.txt"), "utf8"), "mine\n");
  assert.equal(repo.git("rev-parse", "main"), main);
});

test("resume after the pull request opened reports it and opens no second one", (t) => {
  const repo = makeRepo(t, { delivery: "pr" });
  repo.addOrigin();
  repo.failPrCreate();
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Run add-thing stopped at delivery\.\nCause: `gh pr create .*` failed with exit status 1:\nhttps:\/\/github\.com\/test\/repo\/pull\/1\n/);
  repo.failPrCreate(false);
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.ok(resumed.stdout.includes("] delivery: pull request already open: https://github.com/test/repo/pull/1\n"), resumed.stdout);
  assert.equal(repo.ghCalls().filter((args) => args[1] === "create").length, 1);
});

test("resume after a fast-forward failed behind a completed push finishes the delivery", (t) => {
  const repo = makeRepo(t, { delivery: "merge" });
  repo.addOrigin();
  repo.queue("implementer", { edits: { "a.txt": "a\n" } });
  writeFile(repo.top, "a.txt", "in the way\n");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  const tip = repo.git("rev-parse", "loop/add-thing");
  assert.equal(remoteTip(repo, "main"), tip);
  assert.notEqual(repo.git("rev-parse", "main"), tip);
  repo.git("clean", "--quiet", "--force", "a.txt");
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.equal(remoteTip(repo, "main"), tip);
  assert.equal(repo.git("rev-parse", "main"), tip);
});

test("merge delivery preserves an unchecked-out default ref moved after its ancestry check", (t) => {
  const repo = makeRepo(t, { branch: "feature", delivery: "merge" });
  const origin = repo.addOrigin();
  const main = repo.git("rev-parse", "main");
  const concurrent = repo.git("commit-tree", `${main}^{tree}`, "-p", main, "-m", "concurrent writer");
  writeFile(origin, "hooks/pre-receive", `#!/bin/sh\nunset GIT_QUARANTINE_PATH GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES\ngit --git-dir='${join(repo.top, ".git")}' update-ref refs/heads/main '${concurrent}' '${main}'\n`);
  chmodSync(join(origin, "hooks/pre-receive"), 0o755);
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /fast-forwarding main.*cannot lock ref/);
  assert.equal(repo.git("rev-parse", "main"), concurrent);
  assert.equal(remoteTip(repo, "main"), repo.git("rev-parse", "feature"));
});
