import { type ChildProcess, execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
export const BIN = fileURLToPath(new URL(pkg.bin.loop, root));

export const STAGES = ["proposal-review", "implementation", "integration", "archive", "delivery"];
export const FIXTURE_STAGES = STAGES.slice(1);

export function configYaml(defaultBranch = "main"): string {
  return `defaultBranch: ${defaultBranch}
worktrees: .worktrees
agents:
  reviewer: [stub-agent, reviewer]
  reviser: [stub-agent, reviser]
roles:
  proposalReviewer: reviewer
  planReviser: reviser
attempts:
  proposalReview: 3
`;
}

// One scripted turn of the stub agent. Without an entry, a reviewer approves with no findings
// and a reviser changes nothing.
export interface Turn {
  reply?: unknown;
  // Written to the reply file as is, instead of reply.
  raw?: string;
  noReply?: boolean;
  exit?: number;
  // Kills the stub with SIGKILL instead of replying.
  kill?: boolean;
  // Files to write (or delete, with null), relative to the worktree.
  edits?: Record<string, string | null>;
  sleep?: number;
}

export interface Call {
  args: string[];
  cwd: string;
}

export function finding(severity: "blocking" | "minor", problem: string, question: string | null = null) {
  return { severity, location: "design.md", problem, question };
}

// The stub agent: a worker command whose first argument names its queue of scripted turns.
function stubAgent(queue: string, log: string): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const [, schema, reply] = args.slice(-3);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, cwd: process.cwd() }) + "\\n");
const queues = fs.existsSync(${JSON.stringify(queue)}) ? JSON.parse(fs.readFileSync(${JSON.stringify(queue)}, "utf8")) : {};
const turn = (queues[args[0]] || []).shift() || {};
fs.writeFileSync(${JSON.stringify(queue)}, JSON.stringify(queues));
for (const [file, content] of Object.entries(turn.edits || {})) {
  const target = path.join(process.cwd(), file);
  if (content === null) fs.rmSync(target);
  else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}
console.log("stub " + args[0] + " turn " + JSON.stringify(turn));
function finish() {
  if (turn.kill) process.kill(process.pid, "SIGKILL");
  if (turn.exit !== undefined) process.exit(turn.exit);
  if (turn.noReply) return;
  if (turn.raw !== undefined) return fs.writeFileSync(reply, turn.raw);
  const fallback = fs.readFileSync(schema, "utf8").includes('"findings"') ? { findings: [] } : {};
  fs.writeFileSync(reply, JSON.stringify(turn.reply === undefined ? fallback : turn.reply));
}
if (turn.sleep) setTimeout(finish, turn.sleep * 1000);
else finish();
`;
}

// PATH without any real openspec, so each test controls which openspec the loop finds.
const BASE_PATH = (process.env.PATH ?? "")
  .split(delimiter)
  .filter((dir) => dir !== "" && !existsSync(join(dir, "openspec")))
  .join(delimiter);

export interface Result {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface Repo {
  root: string;
  // The worktree of a run started on the default branch.
  worktree: string;
  top: string;
  env: NodeJS.ProcessEnv;
  git(...args: string[]): string;
  gitIn(cwd: string, ...args: string[]): string;
  runDir(change?: string): string;
  setFixture(commands: Record<string, string>): void;
  setOpenSpec(version: string | null): void;
  // Appends scripted turns for the stub agent named reviewer or reviser.
  queue(agent: string, ...turns: Turn[]): void;
  calls(agent?: string): Call[];
}

export interface RepoOptions {
  change?: string;
  defaultBranch?: string;
  // The branch the proposal is committed on; the default branch when omitted.
  branch?: string;
  openspec?: string | null;
  fixture?: Record<string, string>;
}

type After = { after: (fn: () => void) => void };

export function makeRepo(t: After, options: RepoOptions = {}): Repo {
  const change = options.change ?? "add-thing";
  const defaultBranch = options.defaultBranch ?? "main";
  const base = realpathSync(mkdtempSync(join(tmpdir(), "loop-test-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const top = join(base, "repo");
  const bin = join(base, "bin");
  const fixturePath = join(base, "fixture.yaml");
  const queuePath = join(base, "queue.json");
  const logPath = join(base, "calls.jsonl");
  mkdirSync(top);
  mkdirSync(bin);
  const gitConfig = join(base, "gitconfig");
  writeFileSync(gitConfig, "");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}${delimiter}${BASE_PATH}`,
    LOOP_FIXTURE: fixturePath,
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
  const gitIn = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const repo: Repo = {
    root: base,
    worktree: join(top, ".worktrees", change),
    top,
    env,
    git: (...args) => gitIn(top, ...args),
    gitIn,
    runDir: (name = change) => join(top, ".git", "openspec-loop", name),
    setFixture(commands) {
      const all = { ...Object.fromEntries(FIXTURE_STAGES.map((stage) => [stage, "true"])), ...commands };
      writeFileSync(fixturePath, Object.entries(all).map(([stage, command]) => `${stage}: ${JSON.stringify(command)}\n`).join(""));
    },
    setOpenSpec(version) {
      const stub = join(bin, "openspec");
      rmSync(stub, { force: true });
      if (version === null) return;
      writeFileSync(stub, `#!/bin/sh\necho ${version}\n`);
      chmodSync(stub, 0o755);
    },
    queue(agent, ...turns) {
      const queues = existsSync(queuePath) ? JSON.parse(readFileSync(queuePath, "utf8")) : {};
      queues[agent] = [...(queues[agent] ?? []), ...turns];
      writeFileSync(queuePath, JSON.stringify(queues));
    },
    calls(agent) {
      if (!existsSync(logPath)) return [];
      const calls: Call[] = readFileSync(logPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      return agent === undefined ? calls : calls.filter((call) => call.args[0] === agent);
    },
  };
  writeFileSync(join(bin, "stub-agent"), stubAgent(queuePath, logPath));
  chmodSync(join(bin, "stub-agent"), 0o755);
  repo.setOpenSpec(options.openspec === undefined ? "1.14.0" : options.openspec);
  repo.setFixture(options.fixture ?? {});

  repo.git("init", "--quiet", "-b", defaultBranch);
  // Ignored as the README tells users to, so a run leaves the checkout's status unchanged.
  writeFileSync(join(top, ".git", "info", "exclude"), ".worktrees/\n", { flag: "a" });
  writeFile(top, "openspec/loop.yaml", configYaml(defaultBranch));
  repo.git("add", ".");
  repo.git("commit", "--quiet", "-m", "init");
  if (options.branch !== undefined && options.branch !== defaultBranch) repo.git("switch", "--quiet", "-c", options.branch);
  writeFile(top, `openspec/changes/${change}/proposal.md`, "## Why\n\nTest.\n");
  writeFile(top, `openspec/changes/${change}/tasks.md`, "## 1. Work\n\n- [ ] 1.1 Do the thing\n");
  repo.git("add", ".");
  repo.git("commit", "--quiet", "-m", "propose");
  return repo;
}

export function writeFile(top: string, path: string, content: string): void {
  mkdirSync(dirname(join(top, path)), { recursive: true });
  writeFileSync(join(top, path), content);
}

export function loop(args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Result {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd: options.cwd, env: options.env, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function runLoop(repo: Repo, args: string[], cwd = repo.top): Result {
  return loop(args, { cwd, env: repo.env });
}

export interface Running {
  child: ChildProcess;
  waitFor(pattern: RegExp): Promise<void>;
  exited: Promise<Result>;
}

export function startLoop(repo: Repo, args: string[], cwd = repo.top): Running {
  const child = spawn(process.execPath, [BIN, ...args], { cwd, env: repo.env });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const exited = new Promise<Result>((resolve) => child.on("close", (status) => resolve({ status, stdout, stderr })));
  return {
    child,
    async waitFor(pattern) {
      const deadline = Date.now() + 10_000;
      while (!pattern.test(stdout)) {
        if (Date.now() > deadline || child.exitCode !== null) {
          throw new Error(`timed out waiting for ${pattern}; stdout:\n${stdout}\nstderr:\n${stderr}`);
        }
        await sleep(25);
      }
    },
    exited,
  };
}
