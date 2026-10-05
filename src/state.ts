import { existsSync, linkSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./git.js";
import { Refusal } from "./refusal.js";

export const STAGES = ["proposal-review", "implementation", "integration", "archive", "delivery"] as const;
export type Stage = (typeof STAGES)[number];

export interface Stop {
  stage: Stage;
  cause: string;
  recovery: string;
}

export interface RunState {
  change: string;
  branch: string;
  worktree: string;
  stages: Record<Stage, "pending" | "complete">;
  current: Stage | null;
  stop: Stop | null;
  // The plan digest the last approving proposal review covers.
  approvedPlan: string | null;
  // The verdict record of a review whose plan reviser turn has not yet been committed.
  owedReview: string | null;
  // The findings record the next implementer turn must address: failed checks, or an implementation review.
  owedFindings: string | null;
}

export function runDir(top: string, change: string): string {
  return join(git(top, "rev-parse", "--path-format=absolute", "--git-common-dir"), "openspec-loop", change);
}

export function readState(dir: string): RunState | undefined {
  const path = join(dir, "state.json");
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as RunState) : undefined;
}

export function writeState(dir: string, state: RunState): void {
  const path = join(dir, "state.json");
  writeFileSync(`${path}.tmp`, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
}

// Only a positive PID names one process; 0 and negative values signal whole process groups.
export function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export interface LockHolder {
  pid: number;
  alive: boolean;
}

export function lockHolder(dir: string): LockHolder | undefined {
  let text: string;
  try {
    text = readFileSync(join(dir, "lock"), "utf8");
  } catch {
    return undefined;
  }
  const pid = Number(text);
  return { pid, alive: isAlive(pid) };
}

// Takes the run's lock for this process. Returns the PID of a dead advancement it took over, if any.
// The lock is linked into place already holding the PID, so no reader ever sees it empty.
export function acquireLock(dir: string, change: string): number | undefined {
  const path = join(dir, "lock");
  const mine = `${path}.${process.pid}`;
  writeFileSync(mine, String(process.pid));
  try {
    let takenOver: number | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        linkSync(mine, path);
        return takenOver;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      const holder = lockHolder(dir);
      if (!holder) continue;
      if (holder.alive) {
        throw new Refusal(`run ${change} is already advancing in process ${holder.pid} (lock ${path})`);
      }
      unlinkSync(path);
      takenOver = holder.pid;
    }
    throw new Refusal(`could not take the lock ${path}`);
  } finally {
    unlinkSync(mine);
  }
}

export function releaseLock(dir: string): void {
  if (lockHolder(dir)?.pid === process.pid) unlinkSync(join(dir, "lock"));
}
