import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { planDigest } from "../src/plan.js";
import { writeFile } from "./helpers.js";

const TASKS = "openspec/changes/add-thing/tasks.md";

function worktree(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), "loop-plan-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFile(dir, "openspec/changes/add-thing/proposal.md", "## Why\n");
  writeFile(dir, "openspec/changes/add-thing/design.md", "## Decisions\n");
  writeFile(dir, TASKS, "## 1. Work\n\n- [ ] 1.1 Do the thing\n  * [ ] 1.2 Nested\n");
  return dir;
}

test("ticking task boxes keeps the digest", (t) => {
  const dir = worktree(t);
  const before = planDigest(dir, "add-thing");
  writeFile(dir, TASKS, "## 1. Work\n\n- [x] 1.1 Do the thing\n  * [X] 1.2 Nested\n");
  assert.equal(planDigest(dir, "add-thing"), before);
});

const changes: Record<string, (dir: string) => void> = {
  "editing a task's text": (dir) => writeFile(dir, TASKS, "## 1. Work\n\n- [ ] 1.1 Do another thing\n  * [ ] 1.2 Nested\n"),
  "editing the design": (dir) => writeFile(dir, "openspec/changes/add-thing/design.md", "## Decisions\n\nUse files.\n"),
  "adding a file": (dir) => writeFile(dir, "openspec/changes/add-thing/specs/x/spec.md", "## ADDED Requirements\n"),
  "deleting a file": (dir) => rmSync(join(dir, "openspec/changes/add-thing/design.md")),
};

for (const [name, change] of Object.entries(changes)) {
  test(`${name} changes the digest`, (t) => {
    const dir = worktree(t);
    const before = planDigest(dir, "add-thing");
    change(dir);
    assert.notEqual(planDigest(dir, "add-thing"), before);
  });
}
