import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface StepResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface Step {
  result: Promise<StepResult>;
  // The step's process group ID, which is its leader's PID; undefined when the spawn failed.
  group: number | undefined;
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
    group: child.pid,
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
  usage: string;
  transcript: string;
}

// Starts a worker: writes its prompt and schema, then runs its command with the paths of the prompt,
// the schema, the reply and the usage appended, in the worktree with no input.
export function startWorker(command: string[], cwd: string, base: string, prompt: string, schema: object): { step: Step; files: WorkerFiles } {
  const files = {
    prompt: `${base}.prompt.md`,
    schema: `${base}.schema.json`,
    reply: `${base}.reply.json`,
    usage: `${base}.usage.json`,
    transcript: `${base}.log`,
  };
  writeFileSync(files.prompt, prompt);
  writeFileSync(files.schema, `${JSON.stringify(schema, null, 2)}\n`);
  const [executable, ...args] = command;
  return { step: runStep(executable, [...args, files.prompt, files.schema, files.reply, files.usage], cwd, files.transcript), files };
}

// What a worker reports its harness spent: every prompt token the model processed, cached or not, every token it
// generated, reasoning included, and a cost in US dollars.
export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

// Reads a worker's usage file. A missing file reports no usage; a malformed one is a problem.
export function readUsage(path: string): { usage?: Usage } | { problem: string } {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    return { problem: `the usage file cannot be read: ${(error as Error).message}` };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { problem: "the usage file is not JSON" };
  }
  return isUsage(value) ? { usage: value } : { problem: "the usage file does not match the usage format" };
}

function isUsage(value: unknown): value is Usage {
  if (!isObject(value)) return false;
  return Object.entries(value).every(([key, count]) => ["inputTokens", "outputTokens", "costUsd"].includes(key) && isCount(count));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCount(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
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
