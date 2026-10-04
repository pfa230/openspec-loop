import { execFileSync } from "node:child_process";
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
