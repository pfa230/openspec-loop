import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { configYaml, makeRepo, runLoop, writeFile } from "./helpers.js";

test("a proposal missing from the invoking branch is refused", (t) => {
  const repo = makeRepo(t, { branch: "add-thing" });
  repo.git("switch", "--quiet", "main");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /openspec\/changes\/add-thing\/proposal\.md is not committed on main/);
});

test("an uncommitted proposal is refused", (t) => {
  const repo = makeRepo(t);
  writeFile(repo.top, "openspec/changes/other/proposal.md", "## Why\n");
  const result = runLoop(repo, ["run", "other"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /openspec\/changes\/other\/proposal\.md is not committed on main/);
});

const dirtyStates: Record<string, (repo: ReturnType<typeof makeRepo>) => void> = {
  "an untracked file": (repo) => writeFile(repo.top, "notes.txt", "draft\n"),
  "a staged change": (repo) => {
    writeFile(repo.top, "openspec/loop.yaml", `${configYaml()}# staged\n`);
    repo.git("add", "openspec/loop.yaml");
  },
  "an unstaged change to an unrelated tracked file": (repo) => {
    writeFile(repo.top, "README.md", "one\n");
    repo.git("add", "README.md");
    repo.git("commit", "--quiet", "-m", "readme");
    writeFile(repo.top, "README.md", "two\n");
  },
};

for (const [name, dirty] of Object.entries(dirtyStates)) {
  test(`a change-branch worktree with ${name} is refused`, (t) => {
    const repo = makeRepo(t, { branch: "add-thing" });
    dirty(repo);
    const result = runLoop(repo, ["run", "add-thing"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, new RegExp(`worktree ${repo.top} has uncommitted changes`));
  });
}

test("a detached HEAD is refused", (t) => {
  const repo = makeRepo(t);
  repo.git("checkout", "--quiet", "--detach");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /detached HEAD/);
});

test("the default-branch path creates loop/<change> at the invoking HEAD and accepts a dirty checkout", (t) => {
  const repo = makeRepo(t);
  const head = repo.git("rev-parse", "HEAD");
  writeFile(repo.top, "notes.txt", "draft\n");
  const statusBefore = repo.git("status", "--porcelain", "--untracked-files=all");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stderr);
  const worktree = repo.worktree;
  assert.match(result.stdout, new RegExp(`created branch loop/add-thing at ${head.slice(0, 7)} in worktree ${worktree}`));
  assert.equal(repo.git("rev-parse", "loop/add-thing~1"), head);
  assert.equal(repo.gitIn(worktree, "symbolic-ref", "--short", "HEAD"), "loop/add-thing");
  assert.equal(repo.git("rev-parse", "main"), head);
  assert.equal(repo.git("status", "--porcelain", "--untracked-files=all"), statusBefore);
  const state = JSON.parse(readFileSync(join(repo.runDir(), "state.json"), "utf8"));
  assert.equal(state.branch, "loop/add-thing");
  assert.equal(state.worktree, worktree);
});

test("a configured trunk is used while the remote's HEAD points to another branch", (t) => {
  const repo = makeRepo(t, { defaultBranch: "trunk" });
  repo.git("branch", "main");
  repo.git("update-ref", "refs/remotes/origin/main", "main");
  repo.git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(repo.git("rev-parse", "loop/add-thing~1"), repo.git("rev-parse", "trunk"));
});

test("a relative worktrees directory resolves against the invoking checkout", (t) => {
  const repo = makeRepo(t);
  repo.git("switch", "--quiet", "-c", "other");
  const linked = join(repo.root, "linked");
  repo.git("worktree", "add", "--quiet", linked, "main");
  const result = runLoop(repo, ["run", "add-thing"], linked);
  assert.equal(result.status, 0, result.stderr);
  const state = JSON.parse(readFileSync(join(repo.runDir(), "state.json"), "utf8"));
  assert.equal(state.worktree, join(linked, ".worktrees", "add-thing"));
  assert.equal(repo.gitIn(state.worktree, "symbolic-ref", "--short", "HEAD"), "loop/add-thing");
});

test("an absolute worktrees directory is used as given", (t) => {
  const repo = makeRepo(t);
  const worktrees = join(repo.root, "elsewhere");
  writeFile(repo.top, "openspec/loop.yaml", configYaml().replace("worktrees: .worktrees", `worktrees: ${worktrees}`));
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stderr);
  const state = JSON.parse(readFileSync(join(repo.runDir(), "state.json"), "utf8"));
  assert.equal(state.worktree, join(worktrees, "add-thing"));
  assert.equal(repo.gitIn(state.worktree, "symbolic-ref", "--short", "HEAD"), "loop/add-thing");
});

test("an unignored worktrees directory shows as untracked, and the loop leaves the ignore files alone", (t) => {
  const repo = makeRepo(t);
  const exclude = join(repo.top, ".git", "info", "exclude");
  const gitignore = join(repo.top, ".gitignore");
  writeFileSync(exclude, readFileSync(exclude, "utf8").replace(".worktrees/\n", ""));
  writeFileSync(gitignore, "node_modules/\n");
  repo.git("add", ".gitignore");
  repo.git("commit", "--quiet", "-m", "ignore");
  const before = [readFileSync(exclude), readFileSync(gitignore)];
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual([readFileSync(exclude), readFileSync(gitignore)], before);
  assert.equal(repo.git("status", "--porcelain", "--untracked-files=all"), "?? .worktrees/add-thing/");
});

test("the change-branch path creates no branch or worktree", (t) => {
  const repo = makeRepo(t, { branch: "add-thing" });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(repo.git("branch", "--list", "loop/*"), "");
  assert.equal(repo.git("worktree", "list").split("\n").length, 1);
  assert.equal(existsSync(repo.worktree), false);
  const state = JSON.parse(readFileSync(join(repo.runDir(), "state.json"), "utf8"));
  assert.equal(state.branch, "add-thing");
  assert.equal(state.worktree, repo.top);
});

for (const branch of [undefined, "add-thing"]) {
  test(`a committing fixture lands on the run's branch (${branch ?? "default-branch path"})`, (t) => {
    const repo = makeRepo(t, { branch, fixture: { integration: "git commit --quiet --allow-empty -m fixture-commit" } });
    const result = runLoop(repo, ["run", "add-thing"]);
    assert.equal(result.status, 0, result.stderr);
    const runBranch = branch ?? "loop/add-thing";
    assert.equal(repo.git("log", "-1", "--format=%s", `${runBranch}~1`), "fixture-commit");
    assert.equal(repo.git("log", "-1", "--format=%s", "main"), branch ? "init" : "propose");
  });
}

test("an existing loop/<change> branch refuses the run with Git's message", (t) => {
  const repo = makeRepo(t);
  repo.git("branch", "loop/add-thing");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /loop: .*'loop\/add-thing' already exists/);
});
