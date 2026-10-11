import { execFileSync } from "node:child_process";
import type { Config } from "./config.js";
import { Refusal } from "./refusal.js";

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function gitSucceeds(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}

// Git's own message for a failed command, for refusals that repeat it.
export function gitMessage(error: unknown): string {
  const stderr = (error as { stderr?: string }).stderr?.trim();
  return stderr || (error as Error).message;
}

// Identifies a patch within pathspec by its changed lines alone: no context lines, line numbers or display settings.
// The flags override user Git configuration (color.ui, diff drivers, textconv, diff.interHunkContext)
// that would otherwise change the diff, or with color.ui=always leave patch-id with nothing to read.
export function patchId(cwd: string, from: string, to: string, pathspec: string): string {
  const pipeline = 'git diff --no-color --no-ext-diff --no-textconv --unified=0 --inter-hunk-context=0 "$1" "$2" -- "$3" | git patch-id --verbatim';
  const output = execFileSync("sh", ["-c", pipeline, "sh", from, to, pathspec], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return output.split(" ")[0].trim();
}

export function topLevel(cwd: string): string {
  try {
    return git(cwd, "rev-parse", "--show-toplevel");
  } catch {
    throw new Refusal(`${cwd} is not inside a Git working tree`);
  }
}

// The clone's primary checkout, independently of its branch; bare clones have none.
export function primaryCheckout(top: string): string | null {
  const common = git(top, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (git(top, "rev-parse", "--absolute-git-dir") === common) return top;

  const primary = git(top, "worktree", "list", "--porcelain", "-z").split("\0\0")[0].split("\0");
  if (primary.includes("bare")) return null;
  const path = primary[0].slice("worktree ".length);
  try {
    if (topLevel(path) === path && git(path, "rev-parse", "--path-format=absolute", "--git-common-dir") === common) {
      return path;
    }
  } catch {
    // A missing checkout or separated metadata must not silently discard local overrides.
  }
  throw new Refusal(`cannot locate or access main checkout at ${path}; Git did not identify a working tree of this clone`);
}

// Where the default branch is published, as Git records it: the remote, the branch there,
// and the remote-tracking ref Git maps it to.
export interface Upstream {
  remote: string;
  branch: string;
  ref: string;
}

// The ref the change integrates with and is delivered to, and the upstream when the mode needs one.
export interface Base {
  ref: string;
  upstream: Upstream | null;
}

export function deliveryBase(top: string, config: Config): Base {
  const branch = config.defaultBranch;
  if (config.delivery === "local") return { ref: branch, upstream: null };
  let upstream: Upstream;
  try {
    upstream = {
      remote: git(top, "config", "--get", `branch.${branch}.remote`),
      branch: git(top, "config", "--get", `branch.${branch}.merge`).replace(/^refs\/heads\//, ""),
      ref: git(top, "rev-parse", "--symbolic-full-name", `${branch}@{upstream}`),
    };
  } catch {
    throw new Refusal(`default branch ${branch} has no upstream; set one with \`git branch --set-upstream-to=<remote>/${branch} ${branch}\``);
  }
  return { ref: config.delivery === "pr" ? upstream.ref : branch, upstream };
}

// The checkouts that have branch checked out.
export function checkoutsHolding(cwd: string, branch: string): string[] {
  return git(cwd, "worktree", "list", "--porcelain", "-z")
    .split("\0\0")
    .map((entry) => entry.split("\0"))
    .filter((lines) => lines.includes(`branch refs/heads/${branch}`))
    .map((lines) => lines[0].slice("worktree ".length));
}

// A dirty tracked checkout prevents changing the branch; unrelated untracked files are Git's responsibility.
export function dirtyDefaultCheckout(cwd: string, branch: string): string | undefined {
  return checkoutsHolding(cwd, branch).find((checkout) => git(checkout, "status", "--porcelain", "--untracked-files=no") !== "");
}

// The two tips checked for a possible upstream fast-forward. Keep local as the update's expected old value.
export function defaultSynchronization(cwd: string, branch: string, upstream: Upstream): { local: string; published: string } | undefined {
  const local = git(cwd, "rev-parse", branch);
  const published = git(cwd, "rev-parse", upstream.ref);
  if (local === published) return undefined;
  const remote = upstream.ref.replace(/^refs\/remotes\//, "");
  if (gitSucceeds(cwd, "merge-base", "--is-ancestor", published, local)) {
    const ahead = git(cwd, "rev-list", "--count", `${published}..${local}`);
    throw new Error(`${branch} is ${ahead} commit${ahead === "1" ? "" : "s"} ahead of ${remote}`);
  }
  if (!gitSucceeds(cwd, "merge-base", "--is-ancestor", local, published)) {
    throw new Error(`${branch} and ${remote} have diverged`);
  }
  return { local, published };
}

// The caller checked commit contains expectedOld. Never refresh that tip before updating an unchecked-out ref.
export function fastForwardDefault(cwd: string, branch: string, commit: string, expectedOld: string): string | undefined {
  const [checkout] = checkoutsHolding(cwd, branch);
  if (checkout === undefined) {
    git(cwd, "update-ref", `refs/heads/${branch}`, commit, expectedOld);
  } else {
    // Git otherwise overwrites ignored files in the fast-forward's way.
    git(checkout, "merge", "--quiet", "--ff-only", "--no-overwrite-ignore", commit);
  }
  return checkout;
}

// Files with unresolved conflicts in the worktree.
export function conflicted(cwd: string): string[] {
  return git(cwd, "diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
}

export function merging(cwd: string): boolean {
  return gitSucceeds(cwd, "rev-parse", "-q", "--verify", "MERGE_HEAD");
}
