import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface StepResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface Step {
  result: Promise<StepResult>;
  kill(): void;
}

// Numbered so a repeated stage never overwrites an earlier transcript.
export function nextTranscript(dir: string, stage: string): string {
  const transcripts = join(dir, "transcripts");
  mkdirSync(transcripts, { recursive: true });
  const number = String(readdirSync(transcripts).length + 1).padStart(3, "0");
  return join(transcripts, `${number}-${stage}.log`);
}

// Runs a step in its own process group, so stopping it ends everything it started.
export function runStep(command: string, args: string[], cwd: string, transcript: string): Step {
  const fd = openSync(transcript, "a");
  const child = spawn(command, args, { cwd, detached: true, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  const result = new Promise<StepResult>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
  return {
    result,
    kill() {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // The group has already exited.
      }
    },
  };
}
