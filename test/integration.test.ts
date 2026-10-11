import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { finding, makeRepo, type Repo, runLoop, startLoop, writeFile } from "./helpers.js";

const LINE = /^\[\d{2}:\d{2}:\d{2}\] (.*)$/;
const LINES = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`);

function lines(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => LINE.exec(line)?.[1])
    .filter((line): line is string => line !== undefined);
}

function state(repo: Repo) {
  return JSON.parse(readFileSync(join(repo.runDir(), "state.json"), "utf8"));
}

// f.txt with the given lines replaced, by 1-based line number.
function f(changes: Record<number, string> = {}): string {
  return `${LINES.map((line, i) => changes[i + 1] ?? line).join("\n")}\n`;
}

// Commits f.txt on the default branch before the run starts.
function withFile(repo: Repo): Repo {
  writeFile(repo.top, "f.txt", f());
  repo.git("add", "f.txt");
  repo.git("commit", "--quiet", "-m", "add f");
  return repo;
}

// A shell command that commits f.txt with the given content on main in the invoking checkout.
function moveMain(repo: Repo, content: string, message = "move main"): string {
  // The content serves as printf's format, which turns its \n escapes into newlines.
  return `cd ${repo.top} && printf ${JSON.stringify(content)} > f.txt && git commit --quiet -am ${JSON.stringify(message)}`;
}

function implementerPrompts(repo: Repo): string[] {
  const dir = join(repo.runDir(), "transcripts");
  return readdirSync(dir)
    .filter((name) => /-implementation\.prompt\.md$/.test(name))
    .sort()
    .map((name) => readFileSync(join(dir, name), "utf8"));
}

test("a clean rebase leaves a linear branch, other branches alone, and the approval standing", (t) => {
  const repo = withFile(makeRepo(t));
  repo.git("config", "rebase.updateRefs", "true");
  repo.git("config", "diff.interHunkContext", "100");
  repo.queue("implementer", { edits: { "f.txt": f({ 5: "five", 9: "nine" }) } });
  // Line 7 lies between the change's two hunks: context the comparison must ignore.
  repo.queue("verifier", { sh: `git branch side HEAD && ${moveMain(repo, f({ 7: "seven" }))}` });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const main = repo.git("rev-parse", "--short=7", "main");
  assert.ok(lines(result.stdout).includes(`integration: rebased onto main at ${main}`), result.stdout);
  assert.equal(repo.git("rev-list", "--merges", "main..loop/add-thing"), "");
  assert.equal(repo.git("merge-base", "main", "loop/add-thing"), repo.git("rev-parse", "main"));
  assert.equal(repo.git("log", "-1", "--format=%s", "side"), "add-thing: implement");
  assert.notEqual(repo.git("rev-parse", "side"), repo.git("rev-parse", "loop/add-thing~1"));
  assert.equal(repo.calls("verifier").length, 1);
  assert.equal(repo.gitIn(repo.worktree, "show", "HEAD~1:f.txt"), f({ 5: "five", 7: "seven", 9: "nine" }).trimEnd());
});

for (const delivery of ["local", "pr"]) {
  test(`${delivery}: a conflict falls back to a merge the implementer resolves, and the result is checked and reviewed`, (t) => {
    const repo = withFile(makeRepo(t, { delivery }));
    writeFile(repo.top, "openspec/loop.local.yaml", "checks:\n  - test -f f.txt\n");
    repo.git("add", "openspec/loop.local.yaml");
    repo.git("commit", "--quiet", "-m", "checks");
    if (delivery === "pr") repo.addOrigin();
    const base = delivery === "pr" ? "origin/main" : "main";
    // The second turn keeps the branch's version, which leaves the tree equal to HEAD's; the merge must still be committed.
    repo.queue("implementer", { edits: { "f.txt": f({ 5: "five" }) } }, { edits: { "f.txt": f({ 5: "five" }) } });
    repo.queue("verifier", { sh: moveMain(repo, f({ 5: "FIVE" })) + (delivery === "pr" ? " && git push --quiet origin main" : "") });
    const result = runLoop(repo, ["run", "add-thing"]);
    assert.equal(result.status, 0, result.stdout);
    const all = lines(result.stdout);
    const conflict = all.indexOf(`integration: rebase onto ${base} conflicts; merging instead`);
    assert.ok(conflict > 0, result.stdout);
    assert.equal(all[conflict + 1], `integration: merge of ${base} conflicts in 1 file`);
    assert.equal(all[conflict + 2], "implementation: attempt 2 of 3, implementer started (implementer)");
    assert.ok(all.slice(conflict).includes("implementation: attempt 2 of 3, check `test -f f.txt` passed"));
    assert.equal(repo.calls("verifier").length, 2);
    assert.match(implementerPrompts(repo)[1], /Merging (?:origin\/)?main \([0-9a-f]{7}\) into the change conflicts in: f\.txt\. The merge is in progress/);
    const merge = repo.git("log", "-1", "--merges", "--format=%H %s", "loop/add-thing");
    assert.match(merge, / Merge (?:remote-tracking )?branch '(?:refs\/remotes\/origin\/)?main' into loop\/add-thing$/);
    assert.equal(repo.git("rev-list", "--parents", "-n1", merge.slice(0, 40)).split(" ").length, 3);
    assert.equal(repo.gitIn(repo.worktree, "show", "HEAD~1:f.txt"), f({ 5: "five" }).trimEnd());
  });
}

test("an integration that changes the patch returns to the implementer", (t) => {
  const repo = makeRepo(t);
  repo.git("config", "color.ui", "always");
  repo.queue("implementer", { edits: { "a.txt": "a\n", "b.txt": "b\n" } });
  repo.queue("verifier", { sh: `cd ${repo.top} && printf 'b\\n' > b.txt && git add b.txt && git commit --quiet -m "add b"` });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  assert.ok(lines(result.stdout).includes("integration: the patch changed"), result.stdout);
  assert.match(implementerPrompts(repo)[1], /Integrating main changed the change's patch/);
  assert.equal(repo.calls("verifier").length, 2);
  assert.match(state(repo).approvedPatch, /^[0-9a-f]{40}$/);
});

test("a check that fails only on the integrated result returns to the implementer", (t) => {
  const repo = makeRepo(t);
  writeFile(repo.top, "openspec/loop.local.yaml", "checks:\n  - test ! -e broken\n");
  repo.queue("verifier", { sh: `cd ${repo.top} && touch broken && git add broken && git commit --quiet -m "break"` });
  repo.queue("implementer", {}, { edits: { broken: null } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const all = lines(result.stdout);
  const failed = all.indexOf("integration: check `test ! -e broken` failed, exit status 1");
  assert.ok(failed > 0, result.stdout);
  assert.equal(all[failed + 1], "implementation: attempt 2 of 3, implementer started (implementer)");
  assert.match(implementerPrompts(repo)[1], /The check failed with exit status 1/);
});

test("pr mode rebases onto the mapped upstream and delivers a linear branch", (t) => {
  const repo = withFile(makeRepo(t, { delivery: "pr" }));
  repo.git("config", "merge.ff", "only");
  const origin = join(repo.root, "origin.git");
  repo.gitIn(repo.root, "init", "--quiet", "--bare", origin);
  repo.git("remote", "add", "origin", origin);
  repo.git("config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/published/*");
  repo.git("push", "--quiet", "origin", "main:trunk");
  repo.git("fetch", "--quiet", "origin");
  repo.git("branch", "--quiet", "--set-upstream-to=published/trunk", "main");
  const other = join(repo.root, "other");
  repo.gitIn(repo.root, "clone", "--quiet", "--branch", "trunk", origin, other);
  repo.queue("implementer", { edits: { "a.txt": "a\n" } });
  repo.queue("verifier", { sh: `cd ${other} && printf 'x\\n' > x.txt && git add x.txt && git commit --quiet -m moved && git push --quiet origin HEAD:trunk` });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const all = lines(result.stdout);
  const implemented = /implementer committed ([0-9a-f]{7})/.exec(result.stdout)![1];
  const moved = repo.git("rev-parse", "--short=7", "refs/remotes/published/trunk");
  assert.ok(all.includes(`integration: fetched published/trunk at ${moved}`), result.stdout);
  assert.ok(all.includes(`integration: rebased onto published/trunk at ${moved}`), result.stdout);
  assert.equal(repo.git("log", "-1", "--format=%s", implemented), "add-thing: implement");
  assert.throws(() => repo.git("merge-base", "--is-ancestor", implemented, "loop/add-thing"));
  const base = repo.git("rev-parse", "refs/remotes/published/trunk");
  assert.equal(repo.git("merge-base", base, "loop/add-thing"), base);
  assert.equal(repo.gitIn(origin, "rev-parse", "refs/heads/loop/add-thing"), repo.git("rev-parse", "loop/add-thing"));
  assert.equal(repo.gitIn(origin, "rev-list", "--merges", `${base}..refs/heads/loop/add-thing`), "");
  assert.equal(repo.git("rev-parse", "main"), repo.git("rev-parse", "main@{upstream}~1"));
});

test("integration aborts a merge left in progress and integrates again", async (t) => {
  const repo = withFile(makeRepo(t));
  const hold = join(repo.root, "hold");
  writeFile(repo.top, "openspec/loop.local.yaml", `checks:\n  - ${JSON.stringify(`test ! -e ${hold} || sleep 30`)}\n`);
  repo.queue("verifier", { sh: `touch ${hold}` });
  const running = startLoop(repo, ["run", "add-thing"]);
  await running.waitFor(/integration: check .* started/);
  assert.equal(runLoop(repo, ["stop", "add-thing"]).status, 0);
  assert.equal((await running.exited).status, 1);

  repo.gitIn(repo.worktree, "switch", "--quiet", "-c", "side", "main");
  writeFile(repo.worktree, "f.txt", f({ 5: "side" }));
  repo.gitIn(repo.worktree, "commit", "--quiet", "-am", "side");
  repo.gitIn(repo.worktree, "switch", "--quiet", "loop/add-thing");
  writeFile(repo.worktree, "f.txt", f({ 5: "loop" }));
  repo.gitIn(repo.worktree, "commit", "--quiet", "-am", "hand edit");
  assert.throws(() => repo.gitIn(repo.worktree, "merge", "side"));
  assert.ok(existsSync(join(repo.git("rev-parse", "--path-format=absolute", "--git-common-dir"), "worktrees", "add-thing", "MERGE_HEAD")));

  writeFile(repo.top, "openspec/loop.local.yaml", "checks: []\n");
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.deepEqual(lines(resumed.stdout).slice(0, 2), ["integration: started", "integration: aborted an unfinished merge"]);
});

test("a plan edit committed while the run is stopped at integration leaves the patch unchanged", async (t) => {
  const repo = makeRepo(t);
  const hold = join(repo.root, "hold");
  writeFile(repo.top, "openspec/loop.local.yaml", `checks:\n  - ${JSON.stringify(`test ! -e ${hold} || sleep 30`)}\n`);
  repo.queue("implementer", { edits: { "a.txt": "a\n" } });
  repo.queue("verifier", { sh: `touch ${hold}` });
  const running = startLoop(repo, ["run", "add-thing"]);
  await running.waitFor(/integration: check .* started/);
  assert.equal(runLoop(repo, ["stop", "add-thing"]).status, 0);
  assert.equal((await running.exited).status, 1);

  writeFile(repo.worktree, "openspec/changes/add-thing/tasks.md", "## 1. Work\n\n- [ ] 1.1 Do another thing\n");
  repo.gitIn(repo.worktree, "commit", "--quiet", "-am", "edit the plan");
  writeFile(repo.top, "openspec/loop.local.yaml", "checks: []\n");
  const calls = repo.calls().length;
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.ok(!lines(resumed.stdout).includes("integration: the patch changed"), resumed.stdout);
  assert.equal(repo.calls().length, calls);
});

test("a base that takes in one of the change's commits changes the patch", (t) => {
  const repo = makeRepo(t);
  repo.queue("implementer", { edits: { "a.txt": "a\n" } }, { edits: { "b.txt": "b\n" } });
  const takeFirst = `C1=$(git rev-parse HEAD~1) && cd ${repo.top} && git merge --quiet --ff-only $C1 && printf 'c\\n' > c.txt && git add c.txt && git commit --quiet -m unrelated`;
  repo.queue("verifier", { reply: { findings: [finding("blocking", "b.txt is missing")] } }, { sh: takeFirst });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  assert.ok(lines(result.stdout).includes("integration: the patch changed"), result.stdout);
  assert.equal(repo.calls("verifier").length, 3);
});

// A merge-mode repository with origin, and a second clone of origin to move it from.
function mergeRepo(t: Parameters<typeof makeRepo>[0]): { repo: Repo; other: string } {
  const repo = makeRepo(t, { delivery: "merge" });
  const origin = repo.addOrigin();
  const other = join(repo.root, "other");
  repo.gitIn(repo.root, "clone", "--quiet", origin, other);
  return { repo, other };
}

function pushFrom(repo: Repo, other: string, file: string): void {
  writeFile(other, file, `${file}\n`);
  repo.gitIn(other, "add", file);
  repo.gitIn(other, "commit", "--quiet", "-m", file);
  repo.gitIn(other, "push", "--quiet", "origin", "HEAD:main");
}

test("merge mode fast-forwards a default branch that is behind its remote in the checkout holding it", (t) => {
  const { repo, other } = mergeRepo(t);
  pushFrom(repo, other, "remote.txt");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const tip = repo.gitIn(other, "rev-parse", "--short=7", "HEAD");
  assert.ok(lines(result.stdout).includes(`integration: fast-forwarded main to ${tip} in checkout ${repo.top}`), result.stdout);
  assert.equal(readFileSync(join(repo.top, "remote.txt"), "utf8"), "remote.txt\n");
});

test("merge mode stops when the default branch is ahead of its remote", (t) => {
  const { repo } = mergeRepo(t);
  repo.git("commit", "--quiet", "--allow-empty", "-m", "local");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Run add-thing stopped at integration\.\nCause: main is 1 commit ahead of origin\/main\nRecovery: push or remove those commits, then run `loop resume add-thing`\n/);
  repo.git("push", "--quiet", "origin", "main");
  assert.equal(runLoop(repo, ["resume", "add-thing"]).status, 0);
});

test("merge mode stops when the default branch and its remote have diverged", (t) => {
  const { repo, other } = mergeRepo(t);
  repo.git("commit", "--quiet", "--allow-empty", "-m", "local");
  pushFrom(repo, other, "remote.txt");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Cause: main and origin\/main have diverged\nRecovery: reconcile them, then run `loop resume add-thing`\n/);
});

test("a tracked change in the checkout holding the default branch stops the fast-forward, and an untracked file does not", (t) => {
  const { repo, other } = mergeRepo(t);
  pushFrom(repo, other, "remote.txt");
  writeFile(repo.top, "openspec/loop.yaml", `${readFileSync(join(repo.top, "openspec/loop.yaml"), "utf8")}# edited\n`);
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  assert.ok(result.stdout.includes(`Cause: checkout ${repo.top} holds main with uncommitted changes\nRecovery: commit or discard them in ${repo.top}, then run \`loop resume add-thing\`\n`), result.stdout);
  assert.equal(existsSync(join(repo.top, "remote.txt")), false);

  repo.git("checkout", "--", "openspec/loop.yaml");
  writeFile(repo.top, "notes.txt", "mine\n");
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.equal(readFileSync(join(repo.top, "remote.txt"), "utf8"), "remote.txt\n");
  assert.equal(readFileSync(join(repo.top, "notes.txt"), "utf8"), "mine\n");
});

test("a default branch no checkout holds is fast-forwarded by moving its ref", (t) => {
  const { repo, other } = mergeRepo(t);
  repo.git("switch", "--quiet", "-c", "add-thing");
  pushFrom(repo, other, "remote.txt");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const tip = repo.gitIn(other, "rev-parse", "--short=7", "HEAD");
  assert.ok(lines(result.stdout).includes(`integration: fast-forwarded main to ${tip}`), result.stdout);
  assert.equal(repo.git("merge-base", "--is-ancestor", repo.gitIn(other, "rev-parse", "HEAD"), "main"), "");
});
