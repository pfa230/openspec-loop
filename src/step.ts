import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface StepResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface Step {
  result: Promise<StepResult>;
  kill(): void;
}

// The path, without extension, under which a step keeps its files: its transcript (`.log`) and,
// for a worker, its prompt, schema, reply and verdict. Numbered so a repeated step never overwrites an earlier one.
export function nextStep(dir: string, name: string): string {
  const transcripts = join(dir, "transcripts");
  mkdirSync(transcripts, { recursive: true });
  const used = readdirSync(transcripts).map((file) => Number.parseInt(file, 10));
  const number = String(Math.max(0, ...used.filter(Number.isInteger)) + 1).padStart(3, "0");
  return join(transcripts, `${number}-${name}`);
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

export interface WorkerFiles {
  prompt: string;
  schema: string;
  reply: string;
  transcript: string;
}

// Starts a worker: writes its prompt and schema, then runs its command with the paths of the prompt,
// the schema and the reply appended, in the worktree with no input.
export function startWorker(command: string[], cwd: string, base: string, prompt: string, schema: object): { step: Step; files: WorkerFiles } {
  const files = { prompt: `${base}.prompt.md`, schema: `${base}.schema.json`, reply: `${base}.reply.json`, transcript: `${base}.log` };
  writeFileSync(files.prompt, prompt);
  writeFileSync(files.schema, `${JSON.stringify(schema, null, 2)}\n`);
  const [executable, ...args] = command;
  return { step: runStep(executable, [...args, files.prompt, files.schema, files.reply], cwd, files.transcript), files };
}

// Reads a worker's reply and checks it against the step's shape. Returns the reply, or why it is unusable.
export function readReply<T>(path: string, check: (value: unknown) => value is T): { value: T } | { problem: string } {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { problem: "the worker wrote no reply" };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { problem: "the reply is not JSON" };
  }
  return check(value) ? { value } : { problem: "the reply does not match the schema" };
}
