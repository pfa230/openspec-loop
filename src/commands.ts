import { existsSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { join } from "node:path";
import { readConfig } from "./config.js";
import { advance, FIXTURE_NOTE, locations, progress } from "./controller.js";
import { loadFixture } from "./fixture.js";
import { git, gitMessage, gitSucceeds, topLevel } from "./git.js";
import { checkOpenSpec } from "./openspec.js";
import { Refusal } from "./refusal.js";
import {
  acquireLock,
  isAlive,
  lockHolder,
  readState,
  releaseLock,
  runDir,
  STAGES,
  type RunState,
  writeState,
} from "./state.js";

export async function run(change: string): Promise<number> {
  const top = topLevel(process.cwd());
  const config = readConfig(top);
  checkOpenSpec();
  const fixture = loadFixture();
  const dir = runDir(top, change);
  mkdirSync(dir, { recursive: true });
  acquireLock(dir, change);
  try {
    return await advance(dir, enroll(top, dir, change, config.defaultBranch), fixture);
  } catch (error) {
    releaseLock(dir);
    throw error;
  }
}

// Checks the change can run and creates its run. Called under the run's lock.
function enroll(top: string, dir: string, change: string, defaultBranch: string): RunState {
  if (readState(dir)) {
    throw new Refusal(`${change} already has a run; see \`loop status ${change}\` or continue it with \`loop resume ${change}\``);
  }
  let branch: string;
  try {
    branch = git(top, "symbolic-ref", "--quiet", "--short", "HEAD");
  } catch {
    throw new Refusal(`${top} has a detached HEAD; run \`loop run\` on a branch`);
  }
  const head = git(top, "rev-parse", "HEAD");
  const proposal = `openspec/changes/${change}/proposal.md`;
  if (!gitSucceeds(top, "cat-file", "-e", `${head}:${proposal}`)) {
    throw new Refusal(`${proposal} is not committed on ${branch}; commit the proposal on the branch you run \`loop run\` from`);
  }
  const onDefaultBranch = branch === defaultBranch;
  if (!onDefaultBranch && git(top, "status", "--porcelain", "--untracked-files=all") !== "") {
    throw new Refusal(`worktree ${top} has uncommitted changes; commit or remove them before running ${change} on ${branch}`);
  }

  let worktree = top;
  if (onDefaultBranch) {
    branch = `loop/${change}`;
    worktree = join(dir, "worktree");
    try {
      git(top, "worktree", "add", "--quiet", "-b", branch, worktree, head);
    } catch (error) {
      throw new Refusal(gitMessage(error));
    }
    progress(`created branch ${branch} at ${head.slice(0, 7)} in worktree ${worktree}`);
  }
  const state: RunState = { change, branch, worktree, stages: pendingStages(), current: null, stop: null };
  writeState(dir, state);
  return state;
}

export async function resume(change: string): Promise<number> {
  const top = topLevel(process.cwd());
  readConfig(top);
  checkOpenSpec();
  const fixture = loadFixture();
  const dir = runDir(top, change);
  if (!existsSync(dir)) throw noRun(change);
  const deadPid = acquireLock(dir, change);
  let state: RunState;
  try {
    state = existingState(dir, change);
  } catch (error) {
    releaseLock(dir);
    throw error;
  }
  if (deadPid !== undefined) progress(`took over run ${change} from process ${deadPid}, which died`);
  if (STAGES.every((stage) => state.stages[stage] === "complete")) {
    releaseLock(dir);
    process.stdout.write(`Run ${change} is complete. ${FIXTURE_NOTE}\n${locations(dir, state)}`);
    return 0;
  }
  return advance(dir, state, fixture);
}

export async function stop(change: string): Promise<number> {
  const dir = runDir(topLevel(process.cwd()), change);
  existingState(dir, change);
  const holder = lockHolder(dir);
  if (!holder?.alive || !signal(holder.pid)) {
    process.stdout.write(`Run ${change} is not advancing.\n`);
    return 0;
  }
  while (lockHolder(dir)?.pid === holder.pid && isAlive(holder.pid)) await sleep(100);
  process.stdout.write(`Stopped run ${change}.\n`);
  return 0;
}

export async function status(change: string): Promise<number> {
  const dir = runDir(topLevel(process.cwd()), change);
  const state = existingState(dir, change);
  const holder = lockHolder(dir);
  const recovery = `loop resume ${change}`;
  let summary: string;
  if (holder?.alive) {
    summary = `advancing in process ${holder.pid}${state.current ? `, at ${state.current}` : ""}`;
  } else if (STAGES.every((stage) => state.stages[stage] === "complete")) {
    summary = `complete. ${FIXTURE_NOTE}`;
  } else if (state.stop && !holder) {
    summary = `stopped at ${state.stop.stage}\nCause: ${state.stop.cause}\nRecovery: ${state.stop.recovery}`;
  } else {
    const at = state.current ? ` at ${state.current}` : "";
    const died = holder ? `; process ${holder.pid} died` : "";
    summary = `interrupted${at}${died}\nRecovery: ${recovery}`;
  }
  const width = Math.max(...STAGES.map((stage) => stage.length));
  const stages = STAGES.map((stage) => `  ${stage.padEnd(width)}  ${state.stages[stage]}\n`).join("");
  process.stdout.write(`Run ${change}: ${summary}\nBranch: ${state.branch}\nStages:\n${stages}${locations(dir, state)}`);
  return 0;
}

// Asks the advancing process to stop. Returns false when it exited before the signal arrived.
function signal(pid: number): boolean {
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

function existingState(dir: string, change: string): RunState {
  const state = readState(dir);
  if (!state) throw noRun(change);
  return state;
}

function noRun(change: string): Refusal {
  return new Refusal(`${change} has no run; start one with \`loop run ${change}\``);
}

function pendingStages(): RunState["stages"] {
  return Object.fromEntries(STAGES.map((stage) => [stage, "pending"])) as RunState["stages"];
}
