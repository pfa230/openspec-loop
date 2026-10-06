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

export function topLevel(cwd: string): string {
  try {
    return git(cwd, "rev-parse", "--show-toplevel");
  } catch {
    throw new Refusal(`${cwd} is not inside a Git working tree`);
  }
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
