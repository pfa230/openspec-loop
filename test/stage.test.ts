import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";
import { planDigest } from "../src/plan.js";
import { finding, makeRepo, type Repo, runLoop, startLoop, writeFile } from "./helpers.js";

const DESIGN = "openspec/changes/add-thing/design.md";
const TASKS = "openspec/changes/add-thing/tasks.md";
const LINE = /^\[\d{2}:\d{2}:\d{2}\] (.*)$/;

function lines(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => LINE.exec(line)?.[1])
    .filter((line): line is string => line !== undefined && !line.startsWith("created branch"));
}

function state(repo: Repo) {
  return JSON.parse(readFileSync(join(repo.runDir(), "state.json"), "utf8"));
}

function record(repo: Repo, name: string) {
  return JSON.parse(readFileSync(join(repo.runDir(), "transcripts", `${name}.verdict.json`), "utf8"));
}

function subjects(repo: Repo): string[] {
  return repo.git("log", "--format=%s", "main..loop/add-thing").split("\n").filter(Boolean);
}

test("REVISE, a revision and an approving review advance to implementation without the user", (t) => {
  const repo = makeRepo(t);
  repo.queue("reviewer", { reply: { findings: [finding("blocking", "no design")] } }, { reply: { findings: [] } });
  repo.queue("reviser", { edits: { [DESIGN]: "## Decisions\n\nUse files.\n" } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const revision = repo.git("rev-parse", "--short=7", "loop/add-thing");
  assert.deepEqual(lines(result.stdout).slice(0, 8), [
    "proposal-review: review 1 of 3 started (reviewer)",
    "proposal-review: review 1 of 3 REVISE, 1 blocking, 0 minor (reviewer)",
    "proposal-review: plan revision started (reviser)",
    `proposal-review: plan revision committed ${revision} (reviser)`,
    "proposal-review: review 2 of 3 started (reviewer)",
    "proposal-review: review 2 of 3 APPROVE, 0 blocking, 0 minor (reviewer)",
    "proposal-review: complete",
    "implementation: started (fixture)",
  ]);
  assert.deepEqual(subjects(repo), ["add-thing: revise plan"]);
  const first = record(repo, "001-proposal-review");
  const second = record(repo, "003-proposal-review");
  assert.equal(first.verdict, "REVISE");
  assert.equal(second.verdict, "APPROVE");
  assert.notEqual(first.plan, second.plan);
  assert.equal(state(repo).approvedPlan, second.plan);
  assert.equal(state(repo).owedReview, null);
});

test("two agents of one adapter each pass their own model arguments", (t) => {
  const repo = makeRepo(t);
  writeFile(repo.top, "openspec/loop.local.yaml", "agents:\n  reviewer: [stub-agent, reviewer, --model, m1]\n  reviser: [stub-agent, reviser, --model, m2]\n");
  repo.queue("reviewer", { reply: { findings: [finding("blocking", "no design")] } });
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 0);
  assert.deepEqual(repo.calls("reviewer")[0].args.slice(0, 3), ["reviewer", "--model", "m1"]);
  assert.deepEqual(repo.calls("reviser")[0].args.slice(0, 3), ["reviser", "--model", "m2"]);
});

test("APPROVE with minor findings applies them, records the post-fix plan and reviews no further", (t) => {
  const repo = makeRepo(t);
  repo.queue("reviewer", { reply: { findings: [finding("minor", "typo")] } });
  repo.queue("reviser", { edits: { [DESIGN]: "## Decisions\n\nFixed typo.\n" } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const fix = repo.git("rev-parse", "--short=7", "loop/add-thing");
  assert.deepEqual(lines(result.stdout).slice(1, 5), [
    "proposal-review: review 1 of 3 APPROVE, 0 blocking, 1 minor (reviewer)",
    "proposal-review: minor plan fixes started (reviser)",
    `proposal-review: minor plan fixes committed ${fix} (reviser)`,
    "proposal-review: complete",
  ]);
  assert.equal(repo.calls("reviewer").length, 1);
  assert.deepEqual(subjects(repo), ["add-thing: apply minor plan fixes"]);
  const approved = state(repo).approvedPlan;
  assert.equal(approved, planDigest(repo.worktree, "add-thing"));
  assert.notEqual(approved, record(repo, "001-proposal-review").plan);
});

test("one blocking finding among minor ones is REVISE", (t) => {
  const repo = makeRepo(t);
  repo.queue("reviewer", { reply: { findings: [finding("minor", "a"), finding("blocking", "b"), finding("minor", "c")] } });
  repo.queue("reviser", { edits: { [DESIGN]: "x\n" } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.match(result.stdout, /review 1 of 3 REVISE, 1 blocking, 2 minor \(reviewer\)/);
  assert.equal(record(repo, "001-proposal-review").verdict, "REVISE");
});

test("a revision that changes nothing makes no commit", (t) => {
  const repo = makeRepo(t);
  repo.queue("reviewer", { reply: { findings: [finding("blocking", "no design")] } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\] proposal-review: plan revision made no changes \(reviser\)\n/);
  assert.deepEqual(subjects(repo), []);
});

test("a revision commit leaves unrelated staged and unstaged work in the worktree alone", (t) => {
  const repo = makeRepo(t);
  repo.queue("reviewer", { exit: 1 });
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 1);
  writeFile(repo.worktree, "notes.txt", "draft\n");
  writeFile(repo.worktree, "openspec/loop.yaml", `${readFileSync(join(repo.worktree, "openspec/loop.yaml"), "utf8")}# staged\n`);
  repo.gitIn(repo.worktree, "add", "openspec/loop.yaml");
  repo.queue("reviewer", { reply: { findings: [finding("blocking", "no design")] } });
  repo.queue("reviser", { edits: { [DESIGN]: "## Decisions\n" } });
  assert.equal(runLoop(repo, ["resume", "add-thing"]).status, 0);
  assert.equal(repo.git("diff-tree", "--no-commit-id", "--name-only", "-r", "loop/add-thing"), DESIGN);
  assert.equal(repo.gitIn(repo.worktree, "status", "--porcelain", "--untracked-files=all"), "M  openspec/loop.yaml\n?? notes.txt");
});

test("a finding with a question stops the run before revising, and resume after a recorded decision reviews again", (t) => {
  const repo = makeRepo(t);
  repo.queue("reviewer", { reply: { findings: [finding("blocking", "storage undecided", "Files or SQLite?"), finding("minor", "typo")] } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1);
  const review = join(repo.runDir(), "transcripts", "001-proposal-review.verdict.json");
  assert.ok(
    result.stdout.includes(
      "Run add-thing stopped at proposal-review.\nCause: review 1 needs decisions the plan does not record:\n" +
        `  - design.md: Files or SQLite?\nReview: ${review}\n` +
        `Recovery: record the decisions in openspec/changes/add-thing/design.md in worktree ${repo.worktree}, commit them on branch loop/add-thing, then run \`loop resume add-thing\`\n`,
    ),
    result.stdout,
  );
  assert.equal(repo.calls("reviser").length, 0);

  writeFile(repo.worktree, DESIGN, "## Decisions\n\nUse files.\n");
  repo.gitIn(repo.worktree, "add", DESIGN);
  repo.gitIn(repo.worktree, "commit", "--quiet", "-m", "decide storage");
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.equal(lines(resumed.stdout)[0], "proposal-review: review 1 of 3 started (reviewer)");
  assert.equal(repo.calls("reviewer").length, 2);
});

test("the last allowed REVISE stops after its revision, and resume grants a fresh budget", (t) => {
  const repo = makeRepo(t);
  writeFile(repo.top, "openspec/loop.local.yaml", "attempts:\n  proposalReview: 1\n");
  repo.queue("reviewer", { reply: { findings: [finding("blocking", "no design")] } });
  repo.queue("reviser", { edits: { [DESIGN]: "x\n" } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1);
  const review = join(repo.runDir(), "transcripts", "001-proposal-review.verdict.json");
  assert.ok(
    result.stdout.includes(
      `Cause: proposal review attempts exhausted (1 of 1); the last review was REVISE, 1 blocking\nReview: ${review}\nRecovery: loop resume add-thing\n`,
    ),
    result.stdout,
  );
  assert.equal(repo.calls("reviser").length, 1);
  assert.equal(repo.git("log", "-1", "--format=%s", "loop/add-thing"), "add-thing: revise plan");

  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.equal(lines(resumed.stdout)[0], "proposal-review: review 1 of 1 started (reviewer)");
});

test("resume --attempts 1 replaces the configured budget", (t) => {
  const repo = makeRepo(t);
  repo.queue("reviewer", { exit: 1 });
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 1);
  repo.queue("reviewer", { reply: { findings: [finding("blocking", "no design")] } });
  const resumed = runLoop(repo, ["resume", "add-thing", "--attempts", "1"]);
  assert.equal(resumed.status, 1);
  assert.match(resumed.stdout, /review 1 of 1 REVISE/);
  assert.match(resumed.stdout, /Cause: proposal review attempts exhausted \(1 of 1\)/);
  assert.equal(repo.calls("reviewer").length, 2);
});

for (const [verdict, findings, step] of [
  ["REVISE", [finding("blocking", "no design")], "plan revision"],
  ["APPROVE", [finding("minor", "typo")], "minor plan fixes"],
] as const) {
  test(`a stop during the ${step} after ${verdict} is redone first on resume`, async (t) => {
    const repo = makeRepo(t);
    repo.queue("reviewer", { reply: { findings } });
    repo.queue("reviser", { sleep: 30 }, { edits: { [DESIGN]: "x\n" } });
    const running = startLoop(repo, ["run", "add-thing"]);
    await running.waitFor(new RegExp(`${step} started`));
    while (repo.calls("reviser").length === 0) await sleep(25);
    assert.equal(runLoop(repo, ["stop", "add-thing"]).status, 0);
    const stopped = await running.exited;
    assert.equal(stopped.status, 1);
    assert.match(stopped.stdout, new RegExp(`\\] proposal-review: ${step} stopped by the user \\(reviser\\)\\n`));
    assert.match(state(repo).owedReview, /001-proposal-review\.verdict\.json$/);

    const resumed = runLoop(repo, ["resume", "add-thing"]);
    assert.equal(resumed.status, 0, resumed.stdout);
    const progress = lines(resumed.stdout);
    assert.equal(progress[0], `proposal-review: ${step} started (reviser)`);
    assert.match(progress[1], new RegExp(`^proposal-review: ${step} committed `));
    if (verdict === "REVISE") assert.equal(progress[2], "proposal-review: review 1 of 3 started (reviewer)");
    else assert.equal(progress[2], "proposal-review: complete");
    assert.equal(repo.calls("reviewer").length, verdict === "REVISE" ? 2 : 1);
    assert.equal(state(repo).owedReview, null);
  });
}

test("a plan reviser failure stops the run without relaunching it", (t) => {
  const repo = makeRepo(t);
  repo.queue("reviewer", { reply: { findings: [finding("blocking", "no design")] } });
  repo.queue("reviser", { exit: 4 });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Cause: execution failure of planReviser agent "reviser": exit status 4\n/);
  assert.equal(repo.calls("reviser").length, 1);
});

function stoppedAtImplementation(t: Parameters<typeof makeRepo>[0]): Repo {
  const repo = makeRepo(t, { fixture: { implementation: "exit 1" } });
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 1);
  repo.setFixture({});
  return repo;
}

test("ticking a task box keeps the approval", (t) => {
  const repo = stoppedAtImplementation(t);
  writeFile(repo.worktree, TASKS, "## 1. Work\n\n- [x] 1.1 Do the thing\n");
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.equal(lines(resumed.stdout)[0], "implementation: started (fixture)");
});

test("editing a task's text voids the approval and resumes at proposal review", (t) => {
  const repo = stoppedAtImplementation(t);
  writeFile(repo.worktree, TASKS, "## 1. Work\n\n- [ ] 1.1 Do another thing\n");
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.deepEqual(lines(resumed.stdout).slice(0, 2), [
    "plan changed since its approval; reviewing it again",
    "proposal-review: review 1 of 3 started (reviewer)",
  ]);
});

test("a plan changed during advancement is reviewed again at the next stage boundary", (t) => {
  const repo = makeRepo(t, { fixture: { implementation: `printf '## 1. Work\\n\\n- [ ] 1.1 Do another thing\\n' > ${TASKS}` } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const progress = lines(result.stdout);
  const changed = progress.indexOf("plan changed since its approval; reviewing it again");
  assert.deepEqual(progress.slice(changed - 1, changed + 2), [
    "implementation: complete (fixture)",
    "plan changed since its approval; reviewing it again",
    "proposal-review: review 2 of 3 started (reviewer)",
  ]);
  assert.equal(repo.calls("reviewer").length, 2);
});

test("returning to proposal review within one advancement spends the same budget", (t) => {
  const repo = makeRepo(t, { fixture: { implementation: `printf '## 1. Work\\n\\n- [ ] 1.1 Do another thing\\n' > ${TASKS}` } });
  writeFile(repo.top, "openspec/loop.local.yaml", "attempts:\n  proposalReview: 1\n");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Cause: proposal review attempts exhausted \(1 of 1\)\nRecovery: loop resume add-thing\n/);
  assert.equal(repo.calls("reviewer").length, 1);
});

test("a plan that cannot be read stops the run as an execution failure of the loop", (t) => {
  const repo = makeRepo(t, { fixture: { implementation: "rm -r openspec/changes/add-thing" } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Run add-thing stopped at proposal-review\.\nCause: execution failure of the loop: ENOENT/);
  assert.match(state(repo).stop.cause, /^execution failure of the loop/);
  assert.match(runLoop(repo, ["status", "add-thing"]).stdout, /^Run add-thing: stopped at proposal-review\n/);
});

test("a completed run whose plan cannot be read shows the stop in status", (t) => {
  const repo = makeRepo(t);
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 0);
  repo.gitIn(repo.worktree, "rm", "-r", "--quiet", "openspec/changes/add-thing");
  assert.equal(runLoop(repo, ["resume", "add-thing"]).status, 1);
  assert.match(runLoop(repo, ["status", "add-thing"]).stdout, /^Run add-thing: stopped at proposal-review\nCause: execution failure of the loop: ENOENT/);

  repo.gitIn(repo.worktree, "checkout", "--quiet", "HEAD", "--", "openspec/changes/add-thing");
  assert.equal(runLoop(repo, ["resume", "add-thing"]).status, 0);
  assert.equal(state(repo).stop, null);
  assert.match(runLoop(repo, ["status", "add-thing"]).stdout, /^Run add-thing: complete\./);
});

test("a completed run whose plan changed is reviewed again on resume", (t) => {
  const repo = makeRepo(t);
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 0);
  writeFile(repo.worktree, DESIGN, "## Decisions\n");
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.equal(lines(resumed.stdout)[0], "plan changed since its approval; reviewing it again");
  assert.match(resumed.stdout, /Run add-thing completed\./);
});
