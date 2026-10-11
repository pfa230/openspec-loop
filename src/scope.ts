import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { readConfig } from "./config.js";
import { progress } from "./controller.js";
import {
  checkoutsHolding, defaultSynchronization, deliveryBase, dirtyDefaultCheckout, fastForwardDefault,
  git, gitMessage, gitSucceeds, topLevel,
} from "./git.js";
import { Refusal } from "./refusal.js";

// Git refs, worktrees and commits are the session's only durable records.
export async function startScope(session: string): Promise<number> {
  const top = topLevel(process.cwd());
  const config = readConfig(top);
  const branch = sessionBranch(top, session);
  const worktree = join(resolve(top, config.worktrees), `scope-${session}`);
  const [existing] = checkoutsHolding(top, branch);
  if (gitSucceeds(top, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`) || existsSync(worktree)) {
    const checkout = existing === undefined ? "the branch has no registered checkout" : `registered checkout ${existing}`;
    throw new Refusal(`session branch ${branch} or worktree ${worktree} already exists; ${checkout}; inspect it rather than replacing it`);
  }
  let head: string;
  try {
    head = git(top, "rev-parse", "--verify", `refs/heads/${config.defaultBranch}`);
    git(top, "worktree", "add", "--quiet", "-b", branch, worktree, head);
  } catch (error) {
    throw new Refusal(gitMessage(error));
  }
  progress(`scope: created branch ${branch} at ${head.slice(0, 7)} in worktree ${worktree}`);
  process.stdout.write(`Worktree: ${worktree}\nBranch: ${branch}\nFinish from ${top}: ${finishCommand(session)}\n`);
  return 0;
}

export async function finishScope(session: string): Promise<number> {
  const top = topLevel(process.cwd());
  const config = readConfig(top);
  const branch = sessionBranch(top, session);
  const [worktree] = checkoutsHolding(top, branch);
  if (worktree === undefined || !existsSync(join(worktree, ".git"))) {
    throw new Refusal(`session ${session} has no registered checkout for ${branch}; inspect \`git worktree list\`, complete or abort any manual rebase, or restore the session checkout before retrying ${finishCommand(session)} from ${top}`);
  }
  const base = deliveryBase(top, config);
  const retry = `${finishCommand(session)} from ${top}`;
  try {
    if (git(worktree, "status", "--porcelain", "--untracked-files=all") !== "") {
      throw new Refusal(`session worktree ${worktree} has uncommitted changes; finish authoring and commit them or move unfinished drafts elsewhere before retrying ${retry}`);
    }
    if (base.upstream !== null) {
      git(worktree, "fetch", "--quiet", base.upstream.remote, base.upstream.branch);
      progress(`scope: fetched ${base.upstream.ref.replace(/^refs\/remotes\//, "")} at ${git(worktree, "rev-parse", "--short=7", base.upstream.ref)}`);
    }
    if (config.delivery === "merge") {
      const synchronization = defaultSynchronization(worktree, config.defaultBranch, base.upstream!);
      if (synchronization !== undefined) {
        requireCleanDefault(worktree, config.defaultBranch);
        fastForward(worktree, config.defaultBranch, synchronization.published, synchronization.local);
      }
    }

    if (!gitSucceeds(worktree, "merge-base", "--is-ancestor", base.ref, "HEAD")) {
      // Record ownership only: let Git refuse an existing user operation, and never abort it.
      const hadRebase = ["rebase-merge", "rebase-apply"].some((name) => existsSync(resolve(worktree, git(worktree, "rev-parse", "--git-path", name))));
      try {
        git(worktree, "rebase", "--no-update-refs", base.ref);
      } catch (error) {
        if (!hadRebase && gitSucceeds(worktree, "rebase", "--abort")) progress("scope: aborted the failed rebase");
        throw error;
      }
      progress(`scope: rebased ${branch} onto ${base.ref}`);
    }

    const head = git(worktree, "rev-parse", "HEAD");
    if (config.delivery === "pr") {
      const upstream = base.upstream!;
      try {
        git(worktree, "push", "--quiet", upstream.remote, `${branch}:refs/heads/${branch}`);
      } catch (error) {
        process.stderr.write(`loop: ${gitMessage(error)}\nRecovery: in ${worktree}, fetch the session branch ${branch} and current base ${upstream.branch} from ${upstream.remote}; merge the published session history into ${branch}, then merge the current base if it is not already an ancestor; resolve and commit any conflicts before retrying ${retry}\n`);
        return 1;
      }
      progress(`scope: pushed ${branch} to ${upstream.remote} at ${head.slice(0, 7)}`);
      const repository = git(worktree, "remote", "get-url", upstream.remote);
      const target = ["--repo", repository, "--head", branch, "--base", upstream.branch];
      const open = github(worktree, "pr", "list", ...target, "--state", "open", "--json", "url", "--jq", ".[].url").split("\n").find(Boolean);
      if (open !== undefined) {
        progress(`scope: pull request already open: ${open}`);
      } else {
        const created = github(worktree, "pr", "create", ...target, "--fill");
        progress(`scope: opened pull request ${created}`);
      }
    } else {
      requireCleanDefault(worktree, config.defaultBranch);
      // Keep the checked tip as update-ref's expected old value, even across publication.
      const local = git(worktree, "rev-parse", `refs/heads/${config.defaultBranch}`);
      if (!gitSucceeds(worktree, "merge-base", "--is-ancestor", local, head)) {
        throw new Error(`${config.defaultBranch} has commits that branch ${branch} lacks`);
      }
      if (config.delivery === "merge") {
        const upstream = base.upstream!;
        git(worktree, "push", "--quiet", upstream.remote, `${head}:refs/heads/${upstream.branch}`);
        progress(`scope: pushed ${head.slice(0, 7)} to ${upstream.branch} on ${upstream.remote}`);
      }
      fastForward(worktree, config.defaultBranch, head, local);
    }
    process.stdout.write(`Session ${session}: delivered (${config.delivery})\nWorktree: ${worktree}\nBranch: ${branch}\n`);
    return 0;
  } catch (error) {
    if (error instanceof Refusal) throw error;
    process.stderr.write(`loop: ${gitMessage(error)}\nRecovery: reconcile ${branch} with ${base.ref} and clear what Git names in worktree ${worktree} or the default checkout, then retry ${retry}; the session branch and worktree are retained\n`);
    return 1;
  }
}

function sessionBranch(top: string, session: string): string {
  const branch = `scope/${session}`;
  try {
    git(top, "check-ref-format", "--branch", branch);
  } catch (error) {
    throw new Refusal(gitMessage(error));
  }
  return branch;
}

function requireCleanDefault(top: string, branch: string): void {
  const dirty = dirtyDefaultCheckout(top, branch);
  if (dirty !== undefined) throw new Error(`checkout ${dirty} holds ${branch} with uncommitted changes`);
}

function fastForward(top: string, branch: string, commit: string, expectedOld: string): void {
  const checkout = fastForwardDefault(top, branch, commit, expectedOld);
  progress(`scope: fast-forwarded ${branch} to ${commit.slice(0, 7)}${checkout === undefined ? "" : ` in checkout ${checkout}`}`);
}

function github(cwd: string, ...args: string[]): string {
  return execFileSync("gh", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function finishCommand(session: string): string {
  const argument = /^[A-Za-z0-9_./-]+$/.test(session) ? session : `'${session.replaceAll("'", "'\\''")}'`;
  return `loop scope finish ${argument}`;
}
