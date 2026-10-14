import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readState, STAGES } from "../src/state.js";
import { configYaml, finding, makeRepo, runLoop, writeFile } from "./helpers.js";

for (const branch of [undefined, "add-thing"]) {
  test(`step advances one stage at a time through completion (${branch ?? "default branch"})`, (t) => {
    const repo = makeRepo(t, { branch });
    repo.queue("reviewer", { usage: { inputTokens: 10, costUsd: 0.5 } });
    for (const [index, stage] of STAGES.entries()) {
      const cwd = index > 0 ? branch ? repo.top : repo.worktree : repo.top;
      const result = runLoop(repo, ["step", "add-thing"], cwd);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const state = readState(repo.runDir())!;
      assert.equal(state.branch, branch ?? "loop/add-thing");
      assert.equal(state.worktree, branch ? repo.top : repo.worktree);
      assert.equal(state.current, null);
      assert.equal(state.stop, null);
      for (const [position, name] of STAGES.entries()) assert.equal(state.stages[name], position <= index ? "complete" : "pending");
      assert.equal(existsSync(join(repo.runDir(), "lock")), false);
      assert.equal(repo.calls("reviewer").length, 1);
      assert.equal(repo.calls("implementer").length, index === 0 ? 0 : 1);
      assert.equal(repo.calls("verifier").length, index === 0 ? 0 : 1);
      assert.match(result.stdout, /proposalReviewer: 1 step; input 10, output unavailable, cost \$0\.50/);
      const status = runLoop(repo, ["status", "add-thing"]);
      if (index < STAGES.length - 1) {
        assert.match(result.stdout, new RegExp(`returned control between stages after ${stage}\\.\nNext stage: ${STAGES[index + 1]}\nContinue: loop step add-thing or loop resume add-thing\n`));
        assert.match(status.stdout, new RegExp(`^Run add-thing: between stages\nNext stage: ${STAGES[index + 1]}`));
        assert.doesNotMatch(result.stdout, /Run add-thing completed/);
        for (const later of STAGES.slice(index + 1)) assert.doesNotMatch(result.stdout, new RegExp(`\\] ${later}:`));
      } else {
        assert.match(result.stdout, /Run add-thing completed\./);
        assert.match(status.stdout, /^Run add-thing: complete\n/);
      }
      if (index === 0) {
        const reenroll = runLoop(repo, ["run", "add-thing"]);
        assert.equal(reenroll.status, 2);
        assert.match(reenroll.stderr, /already has a run.*loop resume/);
      }
    }
    const head = repo.gitIn(branch ? repo.top : repo.worktree, "rev-parse", "HEAD");
    assert.equal(runLoop(repo, ["step", "add-thing"]).status, 0);
    assert.equal(repo.gitIn(branch ? repo.top : repo.worktree, "rev-parse", "HEAD"), head);
    assert.equal(repo.calls().length, 3);
  });
}

test("step rereads prerequisites and keeps the enrolled worktree", (t) => {
  const repo = makeRepo(t);
  assert.equal(runLoop(repo, ["step", "add-thing"]).status, 0);
  const before = readState(repo.runDir())!;
  for (const bad of ["remote: origin\n", "checks: null\n"]) {
    writeFile(repo.top, "openspec/loop.local.yaml", bad);
    const refused = runLoop(repo, ["step", "add-thing"]);
    assert.equal(refused.status, 2, refused.stderr);
    assert.deepEqual(readState(repo.runDir()), before);
    assert.equal(repo.calls("implementer").length, 0);
  }
  writeFile(repo.top, "openspec/loop.local.yaml", "{}\n");
  writeFile(repo.top, "openspec/loop.yaml", configYaml().replace("worktrees: .worktrees", "worktrees: elsewhere"));
  const continued = runLoop(repo, ["step", "add-thing"]);
  assert.equal(continued.status, 0, continued.stdout + continued.stderr);
  assert.equal(readState(repo.runDir())!.worktree, before.worktree);
  assert.equal(existsSync(join(repo.top, "elsewhere")), false);
});

test("resume continues a stepped run without repeating completed work", (t) => {
  const repo = makeRepo(t);
  assert.equal(runLoop(repo, ["step", "add-thing"]).status, 0);
  const result = runLoop(repo, ["resume", "add-thing"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout, /\] proposal-review:/);
  assert.match(result.stdout, /Run add-thing completed/);
  assert.equal(repo.calls("reviewer").length, 1);
  assert.ok(STAGES.every((stage) => readState(repo.runDir())!.stages[stage] === "complete"));
});

test("a stale lock after a stage succeeded still reports interruption and permits takeover", (t) => {
  const repo = makeRepo(t);
  assert.equal(runLoop(repo, ["step", "add-thing"]).status, 0);
  const deadPid = 2_147_483_647;
  writeFile(repo.runDir(), "lock", String(deadPid));
  const status = runLoop(repo, ["status", "add-thing"]);
  assert.match(status.stdout, new RegExp(`^Run add-thing: interrupted; process ${deadPid} died`));
  assert.doesNotMatch(status.stdout, /between stages/);
  const recovered = runLoop(repo, ["step", "add-thing"]);
  assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
  assert.match(recovered.stdout, new RegExp(`took over run add-thing from process ${deadPid}, which died`));
  assert.match(recovered.stdout, /Next stage: integration/);
  assert.equal(repo.calls("reviewer").length, 1);
});

test("step retains full review cycles, checks and minor fixes inside each stage", (t) => {
  const repo = makeRepo(t);
  repo.queue("reviewer",
    { reply: { findings: [finding("blocking", "needs design")] }, usage: { inputTokens: 10 } },
    { reply: { findings: [finding("minor", "typo")] }, usage: { inputTokens: 20 } },
  );
  repo.queue("reviser",
    { edits: { "openspec/changes/add-thing/design.md": "## Decisions\n" } },
    { edits: { "openspec/changes/add-thing/design.md": "## Decisions\n\nUse files.\n" } },
  );
  const proposed = runLoop(repo, ["step", "add-thing"]);
  assert.equal(proposed.status, 0, proposed.stdout + proposed.stderr);
  assert.match(proposed.stdout, /review 2 of 3 APPROVE, 0 blocking, 1 minor/);
  assert.match(proposed.stdout, /minor plan fixes committed/);
  assert.match(proposed.stdout, /proposalReviewer: 2 steps; input 30, output unavailable, cost unavailable/);
  assert.equal(repo.calls("implementer").length, 0);

  writeFile(repo.top, "openspec/loop.local.yaml", "checks:\n  - test ! -e broken\n");
  repo.queue("implementer",
    { edits: { broken: "bad\n" } },
    { edits: { broken: null, "a.txt": "a\n" } },
    { edits: { "a.txt": "revised\n" } },
    { edits: { "a.txt": "fixed\n" } },
  );
  repo.queue("verifier",
    { reply: { findings: [finding("blocking", "unfinished")] } },
    { reply: { findings: [finding("minor", "typo")] } },
  );
  const implemented = runLoop(repo, ["step", "add-thing"]);
  assert.equal(implemented.status, 0, implemented.stdout + implemented.stderr);
  assert.match(implemented.stdout, /attempt 1 of 3, check .* failed, exit status 1/);
  assert.match(implemented.stdout, /attempt 3 of 3, minor fixes committed/);
  assert.match(implemented.stdout, /Next stage: integration/);
  assert.match(implemented.stdout, /proposalReviewer: 2 steps; input 30, output unavailable, cost unavailable/);
  assert.equal(repo.calls("implementer").length, 4);
  assert.equal(repo.calls("verifier").length, 2);
  assert.equal(readState(repo.runDir())!.owedFindings, null);
  const promptNames = repo.calls().map((call) => call.args.at(-4)!.split("/").at(-1)!);
  assert.equal(new Set(promptNames).size, promptNames.length);
  const numbers = promptNames.map((name) => Number(name.split("-")[0]));
  assert.ok(numbers.every((number, index) => index === 0 || number > numbers[index - 1]!));
});

test("an implementation plan handoff returns after proposal review succeeds", (t) => {
  const repo = makeRepo(t);
  assert.equal(runLoop(repo, ["step", "add-thing"]).status, 0);
  repo.queue("implementer", { edits: { "a.txt": "partial\n" }, reply: { planProblem: "the plan needs a file format" } });
  repo.queue("reviser", { edits: { "openspec/changes/add-thing/design.md": "## Decisions\n\nUse text.\n" } });
  const result = runLoop(repo, ["step", "add-thing"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /implementer reports the plan needs a change/);
  assert.match(result.stdout, /returned control between stages after proposal-review/);
  assert.match(result.stdout, /Next stage: implementation/);
  assert.equal(readState(repo.runDir())!.stages.implementation, "pending");
  assert.equal(readState(repo.runDir())!.owedReview, null);
  assert.equal(repo.calls("reviewer").length, 2);
  assert.equal(repo.calls("implementer").length, 1);
  assert.equal(readFileSync(join(repo.worktree, "a.txt"), "utf8"), "partial\n");
  const next = runLoop(repo, ["step", "add-thing"]);
  assert.equal(next.status, 0, next.stdout + next.stderr);
  assert.match(next.stdout, /attempt 1 of 3, implementer started/);
  assert.match(next.stdout, /Next stage: integration/);
});

for (const kind of ["conflict", "changed patch", "failed check"]) {
  test(`an integration ${kind} returns after implementation succeeds`, (t) => {
    const repo = makeRepo(t);
    writeFile(repo.top, "f.txt", "original\n");
    repo.git("add", "f.txt");
    repo.git("commit", "--quiet", "-m", "base file");
    if (kind === "failed check") writeFile(repo.top, "openspec/loop.local.yaml", "checks:\n  - test ! -e broken\n");
    repo.queue("implementer",
      { edits: kind === "conflict" ? { "f.txt": "ours\n" } : { "a.txt": "a\n", "b.txt": "b\n" } },
      { edits: kind === "conflict" ? { "f.txt": "ours\n" } : kind === "failed check" ? { broken: null } : {} },
    );
    assert.equal(runLoop(repo, ["step", "add-thing"]).status, 0);
    assert.equal(runLoop(repo, ["step", "add-thing"]).status, 0);
    const file = kind === "conflict" ? "f.txt" : kind === "failed check" ? "broken" : "b.txt";
    writeFile(repo.top, file, kind === "conflict" ? "theirs\n" : "b\n");
    repo.git("add", file);
    repo.git("commit", "--quiet", "-m", "move base");
    const result = runLoop(repo, ["step", "add-thing"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /returned control between stages after implementation/);
    assert.match(result.stdout, /Next stage: integration/);
    assert.doesNotMatch(result.stdout, /\] archive:|\] integration: complete/);
    assert.equal(repo.calls("implementer").length, 2);
    assert.equal(repo.calls("verifier").length, 2);
    const state = readState(repo.runDir())!;
    assert.equal(state.stages.implementation, "complete");
    assert.equal(state.stages.integration, "pending");
    assert.equal(state.owedFindings, null);
    const prompt = readFileSync(repo.calls("implementer").at(-1)!.args.at(-4)!, "utf8");
    assert.match(prompt, kind === "conflict" ? /merge is in progress/ : kind === "changed patch" ? /changed the change's patch/ : /check failed with exit status 1/);
    const next = runLoop(repo, ["step", "add-thing"]);
    assert.equal(next.status, 0, next.stdout + next.stderr);
    assert.match(next.stdout, /Next stage: archive/);
    assert.equal(repo.calls("implementer").length, 2);
  });
}

test("step stops on execution failure and recovers the incomplete stage", (t) => {
  const repo = makeRepo(t);
  assert.equal(runLoop(repo, ["step", "add-thing"]).status, 0);
  repo.queue("implementer", { exit: 3 });
  const failed = runLoop(repo, ["step", "add-thing"]);
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /Cause: execution failure of implementer[\s\S]*Transcript:[\s\S]*Usage by role:/);
  assert.match(runLoop(repo, ["status", "add-thing"]).stdout, /^Run add-thing: stopped at implementation/);
  const recovered = runLoop(repo, ["step", "add-thing"]);
  assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
  assert.match(recovered.stdout, /attempt 1 of 3, implementer started/);
  assert.match(recovered.stdout, /Next stage: integration/);
  assert.equal(repo.calls("reviewer").length, 1);
});

test("each step after exhausted attempts gets fresh configured budgets", (t) => {
  const repo = makeRepo(t);
  writeFile(repo.top, "openspec/loop.local.yaml", "attempts:\n  proposalReview: 1\n  implementation: 1\n");
  repo.queue("reviewer", { reply: { findings: [finding("blocking", "unfinished")] } });
  const proposal = runLoop(repo, ["step", "add-thing"]);
  assert.equal(proposal.status, 1);
  assert.match(proposal.stdout, /proposal review attempts exhausted \(1 of 1\)/);
  assert.equal(runLoop(repo, ["step", "add-thing"]).status, 0);
  repo.queue("verifier", { reply: { findings: [finding("blocking", "unfinished")] } });
  const implementation = runLoop(repo, ["step", "add-thing"]);
  assert.equal(implementation.status, 1);
  assert.match(implementation.stdout, /implementation attempts exhausted \(1 of 1\)/);
  const recovered = runLoop(repo, ["step", "add-thing"]);
  assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
  assert.match(recovered.stdout, /attempt 1 of 1, implementer started/);
  const prompt = readFileSync(repo.calls("implementer").at(-1)!.args.at(-4)!, "utf8");
  assert.match(prompt, /unfinished/);
});

for (const role of ["reviewer", "verifier"]) {
  test(`step preserves ${role} decision stops and proposal-review recovery`, (t) => {
    const repo = makeRepo(t);
    if (role === "verifier") assert.equal(runLoop(repo, ["step", "add-thing"]).status, 0);
    repo.queue(role, { reply: { findings: [finding("blocking", "storage undecided", "Files or SQLite?")] } });
    const stopped = runLoop(repo, ["step", "add-thing"]);
    assert.equal(stopped.status, 1);
    assert.match(stopped.stdout, /Files or SQLite\?/);
    assert.equal(repo.calls("reviser").length, 0);
    writeFile(repo.worktree, "openspec/changes/add-thing/design.md", "## Decisions\n\nUse files.\n");
    repo.gitIn(repo.worktree, "add", "openspec/changes/add-thing/design.md");
    repo.gitIn(repo.worktree, "commit", "--quiet", "-m", "decide storage");
    const recovered = runLoop(repo, ["step", "add-thing"]);
    assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
    assert.match(recovered.stdout, /returned control between stages after proposal-review/);
    assert.match(recovered.stdout, /Next stage: implementation/);
    assert.equal(repo.calls("reviewer").length, 2);
  });
}
