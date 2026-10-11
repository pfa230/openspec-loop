import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { makeRepo, type Repo, runLoop, writeFile } from "./helpers.js";

function session(repo: Repo, name = "triage"): string {
  const result = runLoop(repo, ["scope", "start", name]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return repo.git("worktree", "list", "--porcelain").split("\n\n")
    .find((entry) => entry.includes(`branch refs/heads/scope/${name}\n`) || entry.endsWith(`branch refs/heads/scope/${name}`))!
    .split("\n")[0].slice("worktree ".length);
}

function proposal(repo: Repo, worktree: string, change = "next-thing"): string {
  writeFile(worktree, `openspec/changes/${change}/proposal.md`, "Source issue: https://github.com/test/repo/issues/14\n\n## Why\n\nTest.\n");
  writeFile(worktree, `openspec/changes/${change}/tasks.md`, "- [ ] Do the thing\n");
  repo.gitIn(worktree, "add", `openspec/changes/${change}`);
  repo.gitIn(worktree, "commit", "--quiet", "-m", `docs(scope): propose ${change} (relates to #14)`);
  return repo.gitIn(worktree, "rev-parse", "HEAD");
}

function finish(repo: Repo, name = "triage") {
  return runLoop(repo, ["scope", "finish", name]);
}

function remote(repo: Repo, branch: string, name = "origin"): string {
  return repo.git("ls-remote", name, `refs/heads/${branch}`).split("\t")[0];
}

function noRun(repo: Repo, worktree: string) {
  assert.equal(existsSync(join(repo.top, ".git", "openspec-loop")), false);
  assert.deepEqual(repo.calls(), []);
  assert.ok(existsSync(join(worktree, "openspec/changes/next-thing/proposal.md")));
  assert.equal(existsSync(join(worktree, "openspec/changes/archive")), false);
  assert.ok(repo.ghCalls().every((args) => args[0] === "pr"));
}

function moveRemote(repo: Repo, origin: string, file = "base.txt", content = "moved\n"): string {
  const other = join(repo.root, `other-${file.replaceAll("/", "-")}`);
  repo.gitIn(repo.root, "clone", "--quiet", origin, other);
  writeFile(other, file, content);
  repo.gitIn(other, "add", file);
  repo.gitIn(other, "commit", "--quiet", "-m", "move base");
  repo.gitIn(other, "push", "--quiet", "origin", "HEAD");
  return repo.gitIn(other, "rev-parse", "HEAD");
}

test("scope start reads local overrides, accepts Git-valid names, and preserves invoking files and index without workers", (t) => {
  const repo = makeRepo(t, { branch: "other" });
  writeFile(repo.top, "openspec/loop.local.yaml", "worktrees: .worktrees/custom\nagents:\n  reviewer: [missing-worker]\n");
  writeFile(repo.top, "openspec/changes/add-thing/proposal.md", "staged\n");
  repo.git("add", "openspec/changes/add-thing/proposal.md");
  writeFile(repo.top, "openspec/changes/add-thing/proposal.md", "unstaged\n");
  writeFile(repo.top, "scratch.txt", "scratch\n");
  const before = repo.git("status", "--porcelain");
  const index = repo.git("diff", "--cached");
  const result = runLoop(repo, ["scope", "start", "Feature.Part"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const worktree = join(repo.top, ".worktrees/custom/scope-Feature.Part");
  assert.equal(repo.gitIn(worktree, "rev-parse", "HEAD"), repo.git("rev-parse", "main"));
  assert.match(result.stdout, /scope\/Feature.Part/);
  assert.ok(result.stdout.includes(worktree));
  assert.match(result.stdout, /loop scope finish Feature.Part/);
  assert.ok(result.stdout.includes(repo.top));
  assert.equal(repo.git("status", "--porcelain"), before);
  assert.equal(repo.git("diff", "--cached"), index);
  proposal(repo, worktree);
  const delivered = finish(repo, "Feature.Part");
  assert.equal(delivered.status, 0, delivered.stdout + delivered.stderr);
  assert.equal(repo.git("status", "--porcelain"), before);
  assert.equal(repo.git("diff", "--cached"), index);
  assert.deepEqual(repo.calls(), []);
});

test("scope can finish Git-valid names in paths that porcelain would quote", (t) => {
  const repo = makeRepo(t);
  writeFile(repo.top, "openspec/loop.local.yaml", "worktrees: '.worktrees/with spaces'\n");
  const name = 'Quoted"Part';
  const result = runLoop(repo, ["scope", "start", name]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const worktree = join(repo.top, ".worktrees/with spaces", `scope-${name}`);
  proposal(repo, worktree);
  const delivered = finish(repo, name);
  assert.equal(delivered.status, 0, delivered.stdout + delivered.stderr);
  assert.equal(repo.git("rev-parse", "main"), repo.gitIn(worktree, "rev-parse", "HEAD"));
});

test("scope refuses invalid Git names and missing/invalid configuration without creating work", (t) => {
  const repo = makeRepo(t);
  for (const name of ["bad..name", "bad name", "../escape", ""]) {
    const result = runLoop(repo, ["scope", "start", name]);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(repo.git("branch", "--list", "scope/*"), "");
  }
  writeFile(repo.top, "openspec/loop.local.yaml", "delivery: invalid\n");
  assert.equal(runLoop(repo, ["scope", "start", "triage"]).status, 2);
  rmSync(join(repo.top, "openspec/loop.yaml"));
  assert.equal(runLoop(repo, ["scope", "start", "triage"]).status, 2);
  assert.equal(repo.git("branch", "--list", "scope/*"), "");
});

test("scope collisions retain work and distinguish branches with and without checkouts", (t) => {
  const repo = makeRepo(t);
  const worktree = session(repo);
  writeFile(worktree, "draft.md", "keep\n");
  const existing = runLoop(repo, ["scope", "start", "triage"]);
  assert.equal(existing.status, 2);
  assert.ok(existing.stderr.includes(worktree));
  assert.equal(readFileSync(join(worktree, "draft.md"), "utf8"), "keep\n");
  repo.git("branch", "scope/orphan", "main");
  const orphan = runLoop(repo, ["scope", "start", "orphan"]);
  assert.equal(orphan.status, 2);
  assert.match(orphan.stderr, /no registered checkout|without a registered checkout/);
  writeFile(repo.top, ".worktrees/scope-blocked/keep.txt", "keep\n");
  const blocked = runLoop(repo, ["scope", "start", "blocked"]);
  assert.equal(blocked.status, 2);
  assert.ok(blocked.stderr.includes("scope-blocked"));
  assert.equal(readFileSync(join(repo.top, ".worktrees/scope-blocked/keep.txt"), "utf8"), "keep\n");
});

test("scope finish discovers registered worktrees despite a changed configured path", (t) => {
  const repo = makeRepo(t);
  const worktree = session(repo);
  proposal(repo, worktree);
  writeFile(repo.top, "openspec/loop.local.yaml", "worktrees: .worktrees/elsewhere\n");
  const result = finish(repo);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("scope finish refuses missing and manually rebasing checkouts without touching the operation", (t) => {
  const repo = makeRepo(t);
  const missing = finish(repo);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /git worktree list/);
  assert.match(missing.stderr, /rebase/);
  const worktree = session(repo);
  writeFile(worktree, "shared.txt", "session\n");
  repo.gitIn(worktree, "add", "shared.txt");
  repo.gitIn(worktree, "commit", "--quiet", "-m", "session shared");
  writeFile(repo.top, "shared.txt", "default\n");
  repo.git("add", "shared.txt");
  repo.git("commit", "--quiet", "-m", "default shared");
  assert.throws(() => repo.gitIn(worktree, "rebase", "main"));
  const head = repo.gitIn(worktree, "rev-parse", "HEAD");
  const result = finish(repo);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /git worktree list/);
  assert.equal(repo.gitIn(worktree, "rev-parse", "HEAD"), head);
  assert.ok(existsSync(repo.gitIn(worktree, "rev-parse", "--git-path", "rebase-merge")));
  repo.gitIn(worktree, "rebase", "--abort");
  repo.git("worktree", "remove", worktree);
  assert.equal(finish(repo).status, 2);
});

for (const draft of ["openspec/changes/next-thing/proposal.md", "openspec/changes/unfinished/proposal.md"]) {
  test(`scope finish retains unfinished ${draft} with exit 2`, (t) => {
    const repo = makeRepo(t);
    const worktree = session(repo);
    const committed = proposal(repo, worktree);
    const main = repo.git("rev-parse", "main");
    writeFile(worktree, draft, "unfinished\n");
    const result = finish(repo);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.ok(result.stderr.includes(worktree));
    assert.equal(repo.gitIn(worktree, "rev-parse", "HEAD"), committed);
    assert.equal(repo.git("rev-parse", "main"), main);
    assert.equal(readFileSync(join(worktree, draft), "utf8"), "unfinished\n");
  });
}

test("local scope rebases separate proposals onto a moved base, contacts no remote, and permits later explicit enrollment", (t) => {
  const repo = makeRepo(t);
  const worktree = session(repo);
  const firstProposal = proposal(repo, worktree);
  repo.git("branch", "keep-proposal", firstProposal);
  repo.git("config", "rebase.updateRefs", "true");
  proposal(repo, worktree, "second-thing");
  writeFile(repo.top, "base.txt", "base\n");
  repo.git("add", "base.txt");
  repo.git("commit", "--quiet", "-m", "advance base");
  const base = repo.git("rev-parse", "main");
  writeFile(repo.top, "scratch.txt", "scratch\n");
  // A deliberately unusable remote proves local finish does not fetch or push.
  repo.git("remote", "add", "origin", "/nonexistent/remote.git");
  const result = finish(repo);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(repo.git("rev-parse", "main"), repo.gitIn(worktree, "rev-parse", "HEAD"));
  assert.equal(repo.git("rev-list", "--count", `${base}..main`), "2");
  assert.equal(repo.git("rev-parse", "keep-proposal"), firstProposal);
  assert.equal(repo.gitIn(worktree, "log", "-2", "--format=%s").split("\n").length, 2);
  assert.equal(readFileSync(join(repo.top, "base.txt"), "utf8"), "base\n");
  assert.equal(readFileSync(join(repo.top, "scratch.txt"), "utf8"), "scratch\n");
  noRun(repo, worktree);
  const landed = repo.git("rev-parse", "main");
  const enrolled = runLoop(repo, ["run", "next-thing"]);
  assert.equal(enrolled.status, 0, enrolled.stdout + enrolled.stderr);
  assert.equal(repo.git("rev-parse", "main"), landed);
  const state = JSON.parse(readFileSync(repo.runDir("next-thing") + "/state.json", "utf8"));
  assert.equal(state.branch, "loop/next-thing");
  assert.equal(repo.gitIn(state.worktree, "merge-base", landed, "HEAD"), landed);
});

test("scope aborts a conflicting finish rebase, retains commits, and publishes nothing", (t) => {
  const repo = makeRepo(t);
  const worktree = session(repo);
  const committed = proposal(repo, worktree);
  writeFile(repo.top, "openspec/changes/next-thing/proposal.md", "different\n");
  repo.git("add", ".");
  repo.git("commit", "--quiet", "-m", "conflicting base");
  const main = repo.git("rev-parse", "main");
  const result = finish(repo);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr + result.stdout, /conflict|CONFLICT/);
  assert.ok((result.stderr + result.stdout).includes(worktree));
  assert.equal(repo.gitIn(worktree, "rev-parse", "HEAD"), committed);
  assert.equal(repo.git("rev-parse", "main"), main);
  assert.equal(repo.gitIn(worktree, "status", "--porcelain"), "");
  assert.deepEqual(repo.ghCalls(), []);
});

for (const delivery of ["pr", "merge"]) {
  test(`scope ${delivery} refuses a missing upstream before integration`, (t) => {
    const repo = makeRepo(t, { delivery });
    const worktree = session(repo);
    const committed = proposal(repo, worktree);
    const result = finish(repo);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /main has no upstream/);
    assert.equal(repo.gitIn(worktree, "rev-parse", "HEAD"), committed);
    assert.deepEqual(repo.ghCalls(), []);
  });
}

test("PR scope uses the configured alternate upstream, --fill, and reuses a PR after interrupted creation", (t) => {
  const repo = makeRepo(t, { delivery: "pr" });
  const origin = repo.addOrigin();
  repo.git("remote", "rename", "origin", "publish");
  repo.git("push", "--quiet", "publish", "main:refs/heads/trunk");
  repo.git("branch", "--set-upstream-to=publish/trunk", "main");
  const worktree = session(repo);
  const committed = proposal(repo, worktree);
  const main = repo.git("rev-parse", "main");
  repo.failPrCreate();
  assert.equal(finish(repo).status, 1);
  assert.equal(remote(repo, "scope/triage", "publish"), committed);
  assert.equal(repo.git("rev-parse", "main"), main);
  assert.throws(() => repo.git("config", "--get", "branch.scope/triage.remote"));
  assert.deepEqual(repo.ghCalls(), [
    ["pr", "list", "--repo", origin, "--head", "scope/triage", "--base", "trunk", "--state", "open", "--json", "url", "--jq", ".[].url"],
    ["pr", "create", "--repo", origin, "--head", "scope/triage", "--base", "trunk", "--fill"],
  ]);
  repo.failPrCreate(false);
  const retried = finish(repo);
  assert.equal(retried.status, 0, retried.stdout + retried.stderr);
  assert.match(retried.stdout, /already open.*https:\/\//);
  assert.equal(repo.ghCalls().filter((args) => args[1] === "create").length, 1);
  noRun(repo, worktree);
});

test("published PR rebase rejects before lookup, then succeeds after merging published history and current base", (t) => {
  const repo = makeRepo(t, { delivery: "pr" });
  const origin = repo.addOrigin();
  const worktree = session(repo);
  const published = proposal(repo, worktree);
  assert.equal(finish(repo).status, 0);
  const initialCalls = repo.ghCalls().length;
  const main = repo.git("rev-parse", "main");
  const base = moveRemote(repo, origin);
  const rejected = finish(repo);
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  assert.match(rejected.stderr + rejected.stdout, /rejected/);
  assert.match(rejected.stderr + rejected.stdout, /merge/);
  assert.equal(repo.ghCalls().length, initialCalls);
  assert.equal(remote(repo, "scope/triage"), published);
  assert.equal(repo.git("rev-parse", "main"), main);
  repo.gitIn(worktree, "fetch", "--quiet", "origin", "scope/triage", "main");
  repo.gitIn(worktree, "merge", "--quiet", "--no-edit", "origin/scope/triage");
  if (repo.gitIn(worktree, "merge-base", base, "HEAD") !== base) repo.gitIn(worktree, "merge", "--quiet", "--no-edit", "origin/main");
  const reconciled = repo.gitIn(worktree, "rev-parse", "HEAD");
  const result = finish(repo);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(repo.gitIn(worktree, "rev-parse", "HEAD"), reconciled);
  assert.equal(remote(repo, "scope/triage"), reconciled);
  assert.equal(repo.ghCalls().filter((args) => args[1] === "create").length, 1);
  noRun(repo, worktree);
});

test("merge scope synchronizes upstream first and lands unarchived proposals", (t) => {
  const repo = makeRepo(t, { delivery: "merge" });
  const origin = repo.addOrigin();
  const worktree = session(repo);
  proposal(repo, worktree);
  const moved = moveRemote(repo, origin);
  const result = finish(repo);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /fast-forwarded main/);
  const tip = repo.git("rev-parse", "main");
  assert.equal(remote(repo, "main"), tip);
  assert.equal(repo.git("merge-base", moved, tip), moved);
  assert.equal(repo.gitIn(worktree, "rev-parse", "HEAD"), tip);
  noRun(repo, worktree);
});

test("scope rejects a dirty default holder before publishing", (t) => {
  const repo = makeRepo(t, { delivery: "merge" });
  repo.addOrigin();
  const worktree = session(repo);
  proposal(repo, worktree);
  const main = remote(repo, "main");
  writeFile(repo.top, "openspec/changes/add-thing/proposal.md", "dirty\n");
  const result = finish(repo);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok((result.stderr + result.stdout).includes(repo.top));
  assert.equal(remote(repo, "main"), main);
  assert.equal(repo.git("rev-parse", "main"), main);
});

test("merge scope refuses a local default ahead of upstream", (t) => {
  const repo = makeRepo(t, { delivery: "merge" });
  repo.addOrigin();
  const worktree = session(repo);
  proposal(repo, worktree);
  repo.git("commit", "--quiet", "--allow-empty", "-m", "unpushed base");
  const main = repo.git("rev-parse", "main");
  const result = finish(repo);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /ahead/);
  assert.equal(repo.git("rev-parse", "main"), main);
});

test("merge scope retries a published tip after an obstructing ignored file stops the local update", (t) => {
  const repo = makeRepo(t, { delivery: "merge" });
  repo.addOrigin();
  const worktree = session(repo);
  proposal(repo, worktree);
  writeFile(worktree, "private.txt", "proposal\n");
  repo.gitIn(worktree, "add", "private.txt");
  repo.gitIn(worktree, "commit", "--quiet", "-m", "proposal file");
  const tip = repo.gitIn(worktree, "rev-parse", "HEAD");
  repo.git("config", "core.excludesFile", join(repo.root, "ignore"));
  writeFile(repo.root, "ignore", "private.txt\n");
  writeFile(repo.top, "private.txt", "preserve\n");
  const main = repo.git("rev-parse", "main");
  const result = finish(repo);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(remote(repo, "main"), tip);
  assert.equal(repo.git("rev-parse", "main"), main);
  assert.equal(readFileSync(join(repo.top, "private.txt"), "utf8"), "preserve\n");
  rmSync(join(repo.top, "private.txt"));
  const retried = finish(repo);
  assert.equal(retried.status, 0, retried.stdout + retried.stderr);
  assert.equal(repo.git("rev-parse", "main"), tip);
  assert.equal(repo.gitIn(worktree, "rev-parse", "HEAD"), tip);
  noRun(repo, worktree);
});

test("merge scope preserves a concurrent unchecked-out default ref after successful publication", (t) => {
  const repo = makeRepo(t, { branch: "other", delivery: "merge" });
  const origin = repo.addOrigin();
  const worktree = session(repo);
  const tip = proposal(repo, worktree);
  const main = repo.git("rev-parse", "main");
  const concurrent = repo.git("commit-tree", `${main}^{tree}`, "-p", main, "-m", "concurrent writer");
  writeFile(origin, "hooks/pre-receive", `#!/bin/sh\nunset GIT_QUARANTINE_PATH GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES\ngit --git-dir='${join(repo.top, ".git")}' update-ref refs/heads/main '${concurrent}' '${main}'\n`);
  chmodSync(join(origin, "hooks/pre-receive"), 0o755);
  const result = finish(repo);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /cannot lock ref/);
  assert.equal(repo.git("rev-parse", "main"), concurrent);
  assert.equal(remote(repo, "main"), tip);
});
