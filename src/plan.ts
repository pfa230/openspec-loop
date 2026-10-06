import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

export function changeDir(change: string): string {
  return `openspec/changes/${change}`;
}

// A pathspec for everything outside the change's directory, anchored at the worktree root.
export function outsideChange(change: string): string {
  return `:(top,exclude)${changeDir(change)}`;
}

// Every file of the change, as paths relative to the worktree, sorted.
export function planFiles(worktree: string, change: string): string[] {
  const root = join(worktree, changeDir(change));
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(worktree, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort();
}

// Identifies the plan as it stands in the worktree. Task completion marks are bookkeeping, not plan:
// ticking a box in tasks.md keeps the digest, and editing a task's text changes it.
export function planDigest(worktree: string, change: string): string {
  const hash = createHash("sha256");
  const tasks = `${changeDir(change)}/tasks.md`;
  for (const path of planFiles(worktree, change)) {
    let content = readFileSync(join(worktree, path));
    if (path === tasks) content = Buffer.from(content.toString("utf8").replace(/^([ \t]*[-*] \[)[xX]\]/gm, "$1 ]"));
    hash.update(`${path}\0${content.length}\0`);
    hash.update(content);
  }
  return hash.digest("hex");
}
