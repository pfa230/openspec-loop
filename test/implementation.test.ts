import assert from "node:assert/strict";
import { chmodSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";
import { APPLY_GUIDANCE, APPLY_INSTRUCTION, finding, makeRepo, type Repo, runLoop, startLoop, writeFile } from "./helpers.js";

const DESIGN = "openspec/changes/add-thing/design.md";
const TASKS = "openspec/changes/add-thing/tasks.md";
const LINE = /^\[\d{2}:\d{2}:\d{2}\] (.*)$/;

function lines(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => LINE.exec(line)?.[1])
    .filter((line): line is string => line !== undefined && !line.startsWith("created branch"));
}

// The progress lines of the implementation stage, up to and including its completion.
function implementation(stdout: string): string[] {
  const all = lines(stdout);
  const end = all.indexOf("implementation: complete");
  return all.slice(all.findIndex((line) => line.startsWith("implementation:")), end === -1 ? undefined : end + 1);
}

function state(repo: Repo) {
  return JSON.parse(readFileSync(join(repo.runDir(), "state.json"), "utf8"));
}

function transcripts(repo: Repo, suffix: string): string[] {
  const dir = join(repo.runDir(), "transcripts");
  return readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .sort()
    .map((name) => join(dir, name));
}

// The prompt of each implementer turn (implementation and minor fixes), in order.
function implementerPrompts(repo: Repo): string[] {
  return transcripts(repo, ".prompt.md")
    .filter((path) => /-implementation(-fixes)?\.prompt\.md$/.test(path))
    .map((path) => readFileSync(path, "utf8"));
}

function subjects(repo: Repo): string[] {
  return repo.git("log", "--reverse", "--format=%s", "main..loop/add-thing").split("\n").filter(Boolean);
}

function configure(repo: Repo, local: string): void {
  writeFile(repo.top, "openspec/loop.local.yaml", local);
}

const MISSING = "test -f done.txt || { echo done.txt is missing; exit 1; }";

test("a failing check returns to the implementer, and the passing revision is reviewed and approved", (t) => {
  const repo = makeRepo(t);
  configure(repo, `checks:\n  - ${JSON.stringify(MISSING)}\n`);
  repo.queue("implementer", { edits: { "a.txt": "a\n", [TASKS]: "## 1. Work\n\n- [x] 1.1 Do the thing\n" } }, { edits: { "done.txt": "done\n" } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const [first, second] = repo.git("log", "--reverse", "--format=%h", "main..loop/add-thing").split("\n");
  const check = `check \`${MISSING}\``;
  assert.deepEqual(implementation(result.stdout), [
    "implementation: attempt 1 of 3, implementer started (implementer)",
    `implementation: attempt 1 of 3, implementer committed ${first} (implementer)`,
    `implementation: attempt 1 of 3, ${check} started`,
    `implementation: attempt 1 of 3, ${check} failed, exit status 1`,
    "implementation: attempt 2 of 3, implementer started (implementer)",
    `implementation: attempt 2 of 3, implementer committed ${second} (implementer)`,
    `implementation: attempt 2 of 3, ${check} started`,
    `implementation: attempt 2 of 3, ${check} passed`,
    "implementation: attempt 2 of 3, review started (verifier)",
    "implementation: attempt 2 of 3, review APPROVE, 0 blocking, 0 minor (verifier)",
    "implementation: complete",
  ]);
  assert.equal(lines(result.stdout).at(lines(result.stdout).indexOf("implementation: complete") + 1), "integration: started (fixture)");
  assert.deepEqual(subjects(repo), ["add-thing: implement", "add-thing: revise implementation"]);

  const base = repo.git("rev-parse", "main");
  const head = repo.git("rev-parse", "loop/add-thing");
  const [review] = transcripts(repo, "-implementation-review.verdict.json");
  assert.deepEqual(JSON.parse(readFileSync(review, "utf8")), { verdict: "APPROVE", base, commit: head, findings: [] });
  assert.equal(transcripts(repo, "-implementation-review.verdict.json").length, 1);

  const prompts = implementerPrompts(repo);
  for (const prompt of prompts) {
    assert.ok(prompt.includes(APPLY_INSTRUCTION) && prompt.includes(`- ${APPLY_GUIDANCE}`), prompt);
    assert.ok(prompt.includes("- openspec/changes/add-thing/proposal.md\n- openspec/changes/add-thing/tasks.md"), prompt);
    assert.ok(prompt.includes(`The change branches from commit ${base}.`), prompt);
  }
  assert.doesNotMatch(prompts[0], /done\.txt is missing/);
  assert.match(prompts[1], /The check failed with exit status 1\. Transcript: .*-check\.log\\nThe output ends with:\\ndone\.txt is missing/);
  const reviewPrompt = readFileSync(review.replace(".verdict.json", ".prompt.md"), "utf8");
  assert.ok(reviewPrompt.includes(`The change branches from commit ${base}, and commit ${head} is the candidate.`), reviewPrompt);
  assert.ok(reviewPrompt.includes(`- \`${MISSING}\``), reviewPrompt);
  assert.equal(state(repo).owedFindings, null);
});

test("every check runs after one fails, and its failure is recorded as a finding", (t) => {
  const repo = makeRepo(t);
  configure(repo, "checks:\n  - echo first broke; exit 2\n  - echo second ran\nattempts:\n  implementation: 1\n");
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  assert.ok(result.stdout.includes("check `echo second ran` passed"), result.stdout);
  const [record] = transcripts(repo, "-checks.findings.json");
  const { findings } = JSON.parse(readFileSync(record, "utf8"));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].location, "check `echo first broke; exit 2`");
  assert.equal(findings[0].severity, "blocking");
  assert.match(findings[0].problem, /exit status 2[\s\S]*first broke\n$/);
});

test("the failed checks of one round share 20,000 characters of output tail", (t) => {
  const repo = makeRepo(t);
  const check = "head -c 5000 /dev/zero | tr '\\0' x; exit 1";
  configure(repo, `checks:\n${Array.from({ length: 20 }, (_, i) => `  - ${JSON.stringify(`${check} # ${i}`)}\n`).join("")}attempts:\n  implementation: 1\n`);
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 1);
  const [record] = transcripts(repo, "-checks.findings.json");
  const { findings } = JSON.parse(readFileSync(record, "utf8"));
  assert.equal(findings.length, 20);
  const tails = findings.map((entry: { problem: string }) => entry.problem.split("The output ends with:\n")[1]);
  for (const tail of tails) assert.equal(tail, "x".repeat(1000));
});

test("REVISE runs another implementer turn on the review's findings, then the checks and a second review", (t) => {
  const repo = makeRepo(t);
  configure(repo, "checks:\n  - \"true\"\n");
  repo.queue("verifier", { reply: { findings: [finding("blocking", "the thing is not done")] } });
  repo.queue("implementer", { edits: { "a.txt": "a\n" } }, { edits: { "a.txt": "done\n" } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const progress = implementation(result.stdout);
  assert.deepEqual(progress.slice(5, 8), [
    "implementation: attempt 1 of 3, review REVISE, 1 blocking, 0 minor (verifier)",
    "implementation: attempt 2 of 3, implementer started (implementer)",
    `implementation: attempt 2 of 3, implementer committed ${repo.git("rev-parse", "--short=7", "loop/add-thing")} (implementer)`,
  ]);
  assert.deepEqual(progress.slice(8), [
    "implementation: attempt 2 of 3, check `true` started",
    "implementation: attempt 2 of 3, check `true` passed",
    "implementation: attempt 2 of 3, review started (verifier)",
    "implementation: attempt 2 of 3, review APPROVE, 0 blocking, 0 minor (verifier)",
    "implementation: complete",
  ]);
  assert.match(implementerPrompts(repo)[1], /resolve them:[\s\S]*the thing is not done/);
  assert.equal(repo.calls("verifier").length, 2);
});

test("APPROVE with minor findings runs one fix turn and the checks, and reviews no further", (t) => {
  const repo = makeRepo(t);
  configure(repo, "checks:\n  - \"true\"\n");
  repo.queue("verifier", { reply: { findings: [finding("minor", "typo in a.txt")] } });
  repo.queue("implementer", { edits: { "a.txt": "a\n" } }, { edits: { "a.txt": "fixed\n" } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  assert.deepEqual(implementation(result.stdout).slice(5), [
    "implementation: attempt 1 of 3, review APPROVE, 0 blocking, 1 minor (verifier)",
    "implementation: attempt 1 of 3, minor fixes started (implementer)",
    `implementation: attempt 1 of 3, minor fixes committed ${repo.git("rev-parse", "--short=7", "loop/add-thing")} (implementer)`,
    "implementation: attempt 1 of 3, check `true` started",
    "implementation: attempt 1 of 3, check `true` passed",
    "implementation: complete",
  ]);
  assert.deepEqual(subjects(repo), ["add-thing: implement", "add-thing: apply minor implementation fixes"]);
  assert.match(implementerPrompts(repo)[1], /Apply exactly these minor fixes[\s\S]*typo in a\.txt/);
  assert.equal(repo.calls("verifier").length, 1);
  assert.equal(state(repo).owedFindings, null);
});

test("minor fixes that break a check end the attempt, and the next attempt is reviewed", (t) => {
  const repo = makeRepo(t);
  configure(repo, "checks:\n  - test ! -f broken\n");
  repo.queue("verifier", { reply: { findings: [finding("minor", "typo")] } });
  repo.queue("implementer", { edits: { "a.txt": "a\n" } }, { edits: { broken: "x\n" } }, { edits: { broken: null } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const progress = implementation(result.stdout);
  assert.ok(progress.includes("implementation: attempt 1 of 3, check `test ! -f broken` failed, exit status 1"), progress.join("\n"));
  assert.deepEqual(progress.slice(-3), [
    "implementation: attempt 2 of 3, review started (verifier)",
    "implementation: attempt 2 of 3, review APPROVE, 0 blocking, 0 minor (verifier)",
    "implementation: complete",
  ]);
  assert.equal(repo.calls("verifier").length, 2);
});

test("a review finding with a question stops the run, and resume after a recorded decision reviews the plan first", (t) => {
  const repo = makeRepo(t);
  repo.queue("verifier", { reply: { findings: [finding("blocking", "format undecided", "JSON or YAML?")] } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  const [review] = transcripts(repo, "-implementation-review.verdict.json");
  assert.ok(
    result.stdout.includes(
      "Run add-thing stopped at implementation.\nCause: implementation review in attempt 1 of 3 needs decisions the plan does not record:\n" +
        `  - design.md: JSON or YAML?\nReview: ${review}\n` +
        `Recovery: record the decisions in openspec/changes/add-thing/design.md in worktree ${repo.worktree}, commit them on branch loop/add-thing, then run \`loop resume add-thing\`\n`,
    ),
    result.stdout,
  );
  assert.equal(repo.calls("implementer").length, 1);

  writeFile(repo.worktree, DESIGN, "## Decisions\n\nUse JSON.\n");
  repo.gitIn(repo.worktree, "add", DESIGN);
  repo.gitIn(repo.worktree, "commit", "--quiet", "-m", "decide format");
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.deepEqual(lines(resumed.stdout).slice(0, 2), [
    "plan changed since its approval; reviewing it again",
    "proposal-review: review 1 of 3 started (reviewer)",
  ]);
  assert.ok(lines(resumed.stdout).includes("implementation: complete"));
});

test("the last allowed attempt with failing checks stops the run, and resume starts from its findings", (t) => {
  const repo = makeRepo(t);
  configure(repo, `checks:\n  - ${JSON.stringify(MISSING)}\nattempts:\n  implementation: 1\n`);
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 1, result.stdout);
  const [record] = transcripts(repo, "-checks.findings.json");
  assert.ok(
    result.stdout.includes(
      `Cause: implementation attempts exhausted (1 of 1); the last attempt's checks failed\nFindings: ${record}\nRecovery: loop resume add-thing\n`,
    ),
    result.stdout,
  );
  assert.equal(state(repo).owedFindings, record);

  repo.queue("implementer", { edits: { "done.txt": "done\n" } });
  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.equal(lines(resumed.stdout)[0], "implementation: attempt 1 of 1, implementer started (implementer)");
  assert.match(implementerPrompts(repo)[1], /resolve them:[\s\S]*done\.txt is missing/);
});

test("resume --attempts 1 replaces the configured implementation budget", (t) => {
  const repo = makeRepo(t);
  configure(repo, "checks:\n  - exit 1\n");
  repo.queue("implementer", { exit: 1 });
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 1);
  const resumed = runLoop(repo, ["resume", "add-thing", "--attempts", "1"]);
  assert.equal(resumed.status, 1, resumed.stdout);
  assert.match(resumed.stdout, /Cause: implementation attempts exhausted \(1 of 1\); the last attempt's checks failed\n/);
  assert.equal(repo.calls("implementer").length, 2);
});

test("a plan problem goes through the plan reviser and proposal review, and implementation continues its attempts", (t) => {
  const repo = makeRepo(t);
  repo.queue("implementer", { edits: { "a.txt": "a\n" }, reply: { planProblem: "task 1.1 needs a file format" } });
  repo.queue("reviser", { edits: { [DESIGN]: "## Decisions\n\nUse JSON.\n" } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const progress = lines(result.stdout);
  const reported = progress.indexOf("implementation: attempt 1 of 3, implementer reports the plan needs a change (implementer)");
  assert.deepEqual(progress.slice(reported + 1, reported + 7), [
    "proposal-review: plan revision started (reviser)",
    `proposal-review: plan revision committed ${repo.git("rev-parse", "--short=7", "loop/add-thing")} (reviser)`,
    "proposal-review: review 2 of 3 started (reviewer)",
    "proposal-review: review 2 of 3 APPROVE, 0 blocking, 0 minor (reviewer)",
    "proposal-review: complete",
    "implementation: attempt 2 of 3, implementer started (implementer)",
  ]);
  assert.deepEqual(subjects(repo), ["add-thing: implement", "add-thing: revise plan"]);
  const [problem] = transcripts(repo, "-plan-problem.json");
  assert.deepEqual(JSON.parse(readFileSync(problem, "utf8")).findings, [
    { severity: "blocking", location: "implementation", problem: "task 1.1 needs a file format", question: null },
  ]);
  const revision = transcripts(repo, "-plan-revision.prompt.md").map((path) => readFileSync(path, "utf8"));
  assert.match(revision[0], /task 1\.1 needs a file format/);
});

test("an implementer turn that edits a task's text returns to proposal review, and one ticking a box does not", (t) => {
  const repo = makeRepo(t);
  repo.queue("implementer", { edits: { [TASKS]: "## 1. Work\n\n- [x] 1.1 Do the thing\n" } });
  assert.equal(runLoop(repo, ["run", "add-thing"]).status, 0);
  assert.equal(repo.calls("reviewer").length, 1);

  const edited = makeRepo(t);
  edited.queue("implementer", { edits: { [TASKS]: "## 1. Work\n\n- [ ] 1.1 Do another thing\n" } });
  const result = runLoop(edited, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const progress = lines(result.stdout);
  const changed = progress.indexOf("plan changed since its approval; reviewing it again");
  assert.match(progress[changed - 1], /^implementation: attempt 1 of 3, implementer committed /);
  assert.equal(progress[changed + 1], "proposal-review: review 2 of 3 started (reviewer)");
});

test("a minor-fix turn that edits a task's text returns to proposal review, and a full round with review follows", (t) => {
  const repo = makeRepo(t);
  repo.queue("verifier", { reply: { findings: [finding("minor", "typo")] } });
  repo.queue("implementer", { edits: { "a.txt": "a\n" } }, { edits: { [TASKS]: "## 1. Work\n\n- [ ] 1.1 Do another thing\n" } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  const progress = lines(result.stdout);
  const changed = progress.indexOf("plan changed since its approval; reviewing it again");
  assert.match(progress[changed - 1], /^implementation: attempt 1 of 3, minor fixes committed /);
  assert.equal(progress[changed + 1], "proposal-review: review 2 of 3 started (reviewer)");
  assert.deepEqual(implementation(result.stdout.slice(result.stdout.indexOf("review 2 of 3"))).slice(-3), [
    "implementation: attempt 2 of 3, review started (verifier)",
    "implementation: attempt 2 of 3, review APPROVE, 0 blocking, 0 minor (verifier)",
    "implementation: complete",
  ]);
});

test("a minor-fix turn that reports a plan problem leads, after reapproval, to a full round with review", (t) => {
  const repo = makeRepo(t);
  repo.queue("verifier", { reply: { findings: [finding("minor", "typo")] } });
  repo.queue("implementer", { edits: { "a.txt": "a\n" } }, { reply: { planProblem: "the fix needs a new task" } });
  const result = runLoop(repo, ["run", "add-thing"]);
  assert.equal(result.status, 0, result.stdout);
  assert.deepEqual(implementation(result.stdout.slice(result.stdout.indexOf("review 2 of 3"))), [
    "implementation: attempt 2 of 3, implementer started (implementer)",
    "implementation: attempt 2 of 3, implementer made no changes (implementer)",
    "implementation: attempt 2 of 3, review started (verifier)",
    "implementation: attempt 2 of 3, review APPROVE, 0 blocking, 0 minor (verifier)",
    "implementation: complete",
  ]);
  assert.equal(repo.calls("verifier").length, 2);
});

test("a stop during an implementer turn is redone on resume with the same findings", async (t) => {
  const repo = makeRepo(t);
  configure(repo, `checks:\n  - ${JSON.stringify(MISSING)}\n`);
  repo.queue("implementer", {}, { sleep: 30 }, { edits: { "done.txt": "done\n" } });
  const running = startLoop(repo, ["run", "add-thing"]);
  await running.waitFor(/attempt 2 of 3, implementer started/);
  while (repo.calls("implementer").length < 2) await sleep(25);
  assert.equal(runLoop(repo, ["stop", "add-thing"]).status, 0);
  const stopped = await running.exited;
  assert.equal(stopped.status, 1);
  assert.match(stopped.stdout, /\] implementation: attempt 2 of 3, implementer stopped by the user \(implementer\)\n/);

  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.equal(lines(resumed.stdout)[0], "implementation: attempt 1 of 3, implementer started (implementer)");
  const prompts = implementerPrompts(repo);
  assert.equal(prompts.length, 3);
  assert.equal(prompts[2], prompts[1]);
});

test("a stop during minor fixes is redone on resume, and the stage completes without review", async (t) => {
  const repo = makeRepo(t);
  repo.queue("verifier", { reply: { findings: [finding("minor", "typo")] } });
  repo.queue("implementer", { edits: { "a.txt": "a\n" } }, { sleep: 30 }, { edits: { "a.txt": "fixed\n" } });
  const running = startLoop(repo, ["run", "add-thing"]);
  await running.waitFor(/minor fixes started/);
  while (repo.calls("implementer").length < 2) await sleep(25);
  assert.equal(runLoop(repo, ["stop", "add-thing"]).status, 0);
  assert.equal((await running.exited).status, 1);

  const resumed = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.deepEqual(implementation(resumed.stdout), [
    "implementation: attempt 1 of 3, minor fixes started (implementer)",
    `implementation: attempt 1 of 3, minor fixes committed ${repo.git("rev-parse", "--short=7", "loop/add-thing")} (implementer)`,
    "implementation: complete",
  ]);
  assert.equal(repo.calls("verifier").length, 1);
});

for (const agent of ["implementer", "verifier"]) {
  test(`an execution failure of the ${agent} stops the run without relaunching it`, (t) => {
    const repo = makeRepo(t);
    repo.queue(agent, { exit: 4 });
    const result = runLoop(repo, ["run", "add-thing"]);
    assert.equal(result.status, 1, result.stdout);
    const role = agent === "implementer" ? "implementer" : "implementationReviewer";
    assert.match(result.stdout, new RegExp(`Cause: execution failure of ${role} agent "${agent}": exit status 4\\n`));
    assert.equal(repo.calls(agent).length, 1);
  });
}

for (const [name, script] of [
  ["fails", "echo no such change >&2; exit 1"],
  ["prints no usable instructions", "echo not json"],
] as const) {
  test(`openspec instructions apply that ${name} stops the run as an execution failure of the loop`, (t) => {
    const repo = makeRepo(t);
    const stub = join(repo.root, "bin", "openspec");
    writeFileSync(stub, `#!/bin/sh\nif [ "$1" = instructions ]; then ${script}; fi\necho 1.14.0\n`);
    chmodSync(stub, 0o755);
    const result = runLoop(repo, ["run", "add-thing"]);
    assert.equal(result.status, 1, result.stdout);
    const cause = name === "fails" ? "failed: no such change" : "printed no usable instructions";
    assert.ok(
      result.stdout.includes(`Run add-thing stopped at implementation.\nCause: execution failure of the loop: \`openspec instructions apply --change add-thing\` ${cause}\n`),
      result.stdout,
    );
    assert.equal(repo.calls("implementer").length, 0);
  });
}
