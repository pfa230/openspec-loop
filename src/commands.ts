import { existsSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { join, resolve } from "node:path";
import { type Config, readConfig, resolveRoles, ROLES, writeLocalRoles } from "./config.js";
import { advance, continuation, locations, progress, reopenPlan, type Setup } from "./controller.js";
import { deliveryBase, git, gitMessage, gitSucceeds, topLevel } from "./git.js";
import { checkOpenSpec } from "./openspec.js";
import { changeDir } from "./plan.js";
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

export async function run(change: string, roles?: string[]): Promise<number> {
  return start(change, "run", roles);
}

export async function step(change: string, roles?: string[]): Promise<number> {
  return start(change, "step", roles);
}

export async function resume(change: string, roles?: string[], attempts?: number, implement = false, review = false): Promise<number> {
  return start(change, "resume", roles, attempts, implement, review);
}

// Every advancement prepares and takes the same lock before enrolling or loading the run.
// Agent aliases named on the command replace the configured roles, in role order.
async function start(change: string, command: "run" | "step" | "resume", roles?: string[], attempts?: number, implement = false, review = false): Promise<number> {
  const top = topLevel(process.cwd());
  const setup = prepare(top, attempts, roles);
  const dir = runDir(top, change);
  if (command === "resume" && !existsSync(dir)) throw noRun(change);
  mkdirSync(dir, { recursive: true });
  const deadPid = acquireLock(dir, change);
  try {
    const state = command === "run" ? enroll(top, dir, change, setup.config)
      : command === "step" ? readState(dir) ?? enroll(top, dir, change, setup.config)
      : existingState(dir, change);
    if (implement) reimplement(state);
    if (review) rereview(state);
    if (roles) writeLocalRoles(state.worktree, setup.config.roles);
    if (deadPid !== undefined) progress(`took over run ${change} from process ${deadPid}, which died`);
    return await advance(dir, state, setup, command === "step");
  } catch (error) {
    releaseLock(dir);
    throw error;
  }
}

// Reads what an advancement needs, refusing before anything advances.
function prepare(top: string, attempts: number | undefined, roles: string[] | undefined): Setup {
  const config = readConfig(top);
  if (roles) config.roles = Object.fromEntries(ROLES.map((role, index) => [role, roles[index]])) as Config["roles"];
  const agents = resolveRoles(top, config);
  const base = deliveryBase(top, config);
  checkOpenSpec();
  return { config, agents, base, attempts };
}

// Checks the change can run and creates its run. Called under the run's lock.
function enroll(top: string, dir: string, change: string, config: Config): RunState {
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
  const onDefaultBranch = branch === config.defaultBranch;
  if (!onDefaultBranch && git(top, "status", "--porcelain", "--untracked-files=all") !== "") {
    throw new Refusal(`worktree ${top} has uncommitted changes; commit or remove them before running ${change} on ${branch}`);
  }

  let worktree = top;
  if (onDefaultBranch) {
    branch = `loop/${change}`;
    worktree = join(resolve(top, config.worktrees), change);
    try {
      git(top, "worktree", "add", "--quiet", "-b", branch, worktree, head);
    } catch (error) {
      throw new Refusal(gitMessage(error));
    }
    progress(`created branch ${branch} at ${head.slice(0, 7)} in worktree ${worktree}`);
  }
  const state: RunState = { change, branch, worktree, stages: pendingStages(), current: null, stop: null, owedReview: null, owedFindings: null, approvedPatch: null, stepGroup: null };
  writeState(dir, state);
  return state;
}

// Makes implementation and every later stage incomplete, so the implementer implements the plan as it stands;
// advance() persists the change. Proposal review and owed records stay as they are.
function reimplement(state: RunState): void {
  // Once OpenSpec has moved the change, no plan is left to implement; archive() uses the same test.
  if (!existsSync(join(state.worktree, changeDir(state.change)))) {
    throw new Refusal(`${state.change} is archived in worktree ${state.worktree}; \`--implement\` reopens implementation only before archival`);
  }
  for (const stage of STAGES.slice(STAGES.indexOf("implementation"))) state.stages[stage] = "pending";
}

// Makes proposal review and every later stage incomplete, so the current plan is reviewed before implementing on.
// A proposal revision still owed to an earlier plan is dropped: the first worker must review the plan as it stands.
// advance() persists the reopened stages, the cleared revision and the findings reopenPlan() already drops.
function rereview(state: RunState): void {
  // Once OpenSpec has moved the change, no plan is left to review; archive() uses the same test.
  if (!existsSync(join(state.worktree, changeDir(state.change)))) {
    throw new Refusal(`${state.change} is archived in worktree ${state.worktree}; \`--review\` reopens proposal review only before archival`);
  }
  reopenPlan(state);
  state.owedReview = null;
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

export async function status(change: string, json = false): Promise<number> {
  const dir = runDir(topLevel(process.cwd()), change);
  const state = existingState(dir, change);
  const holder = lockHolder(dir);
  const recovery = `loop resume ${change}`;
  let summary: string;
  let observation: "advancing" | "stopped" | "complete" | "between-stages" | "interrupted";
  if (holder?.alive) {
    observation = "advancing";
    summary = `advancing in process ${holder.pid}${state.current ? `, at ${state.current}` : ""}`;
  } else if (state.stop && !holder) {
    observation = "stopped";
    summary = `stopped at ${state.stop.stage}\nCause: ${state.stop.cause}\nRecovery: ${state.stop.recovery}`;
  } else if (STAGES.every((stage) => state.stages[stage] === "complete")) {
    observation = "complete";
    summary = "complete";
  } else if (!holder && state.current === null && state.stop === null) {
    observation = "between-stages";
    summary = `between stages\n${continuation(state)}`;
  } else {
    observation = "interrupted";
    const at = state.current ? ` at ${state.current}` : "";
    const died = holder ? `; process ${holder.pid} died` : "";
    summary = `interrupted${at}${died}\nRecovery: ${recovery}`;
  }
  const width = Math.max(...STAGES.map((stage) => stage.length));
  const stages = STAGES.map((stage) => `  ${stage.padEnd(width)}  ${state.stages[stage]}\n`).join("");
  const report = `Run ${change}: ${summary}\nBranch: ${state.branch}\nStages:\n${stages}${locations(dir, state)}`;
  process.stdout.write(json ? `${JSON.stringify({ version: 1, status: observation, branch: state.branch, worktree: state.worktree, report })}\n` : report);
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
