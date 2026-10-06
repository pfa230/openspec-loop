import { type ChildProcess, execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
export const BIN = fileURLToPath(new URL(pkg.bin.loop, root));

export function configYaml(defaultBranch = "main", delivery = "local"): string {
  return `defaultBranch: ${defaultBranch}
worktrees: .worktrees
agents:
  reviewer: [stub-agent, reviewer]
  reviser: [stub-agent, reviser]
  implementer: [stub-agent, implementer]
  verifier: [stub-agent, verifier]
roles:
  proposalReviewer: reviewer
  planReviser: reviser
  implementer: implementer
  implementationReviewer: verifier
attempts:
  proposalReview: 3
  implementation: 3
checks: []
delivery: ${delivery}
`;
}

// One scripted turn of the stub agent. Without an entry, a reviewer approves with no findings,
// and a reviser or an implementer changes nothing.
export interface Turn {
  reply?: unknown;
  // Written to the reply file as is, instead of reply.
  raw?: string;
  // Written to the usage file: an object as JSON, a string as is.
  usage?: unknown;
  noReply?: boolean;
  exit?: number;
  // Kills the stub with SIGKILL instead of replying.
  kill?: boolean;
  // Files to write (or delete, with null), relative to the worktree.
  edits?: Record<string, string | null>;
  // A shell command run in the worktree after the edits, such as one that moves the default branch mid-run.
  sh?: string;
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
const [, schema, reply, usage] = args.slice(-4);
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
if (turn.sh) require("node:child_process").execSync(turn.sh, { stdio: "inherit" });
function finish() {
  if (turn.usage !== undefined) fs.writeFileSync(usage, typeof turn.usage === "string" ? turn.usage : JSON.stringify(turn.usage));
  if (turn.kill) process.kill(process.pid, "SIGKILL");
  if (turn.exit !== undefined) process.exit(turn.exit);
  if (turn.noReply) return;
  if (turn.raw !== undefined) return fs.writeFileSync(reply, turn.raw);
  const shape = fs.readFileSync(schema, "utf8");
  const fallback = shape.includes('"findings"') ? { findings: [] } : shape.includes('"planProblem"') ? { planProblem: null } : {};
  fs.writeFileSync(reply, JSON.stringify(turn.reply === undefined ? fallback : turn.reply));
}
if (turn.sleep) setTimeout(finish, turn.sleep * 1000);
else finish();
`;
}

// The stub gh: answers `pr list` from the pull requests in a file, filtered by --head and --base, and on
// `pr create` adds one with a fixed URL and prints it, then exits 1 while the failure marker exists.
function stubGh(prs: string, log: string, failMarker: string): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
const prs = fs.existsSync(${JSON.stringify(prs)}) ? JSON.parse(fs.readFileSync(${JSON.stringify(prs)}, "utf8")) : [];
const option = (name) => args[args.indexOf(name) + 1];
if (args[0] === "pr" && args[1] === "list") {
  for (const pr of prs) if (pr.head === option("--head") && pr.base === option("--base")) console.log(pr.url);
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "create") {
  const url = "https://github.com/test/repo/pull/" + (prs.length + 1);
  prs.push({ url, base: option("--base"), head: option("--head") });
  fs.writeFileSync(${JSON.stringify(prs)}, JSON.stringify(prs));
  console.log(url);
  process.exit(fs.existsSync(${JSON.stringify(failMarker)}) ? 1 : 0);
}
process.exit(2);
`;
}

// The stub openspec's answer to `openspec instructions apply --change <change> --json`.
export const APPLY_INSTRUCTION = "Read context files, work through pending tasks, mark complete as you go.";
export const APPLY_GUIDANCE = "Keep summaries short.";
const APPLY = `if [ "$1" = instructions ]; then
  printf '{"changeName":"%s","instruction":"${APPLY_INSTRUCTION}","operationGuidance":["${APPLY_GUIDANCE}"],"contextFiles":{"proposal":["%s/openspec/changes/%s/proposal.md"],"tasks":["%s/openspec/changes/%s/tasks.md"]}}\\n' "$4" "$PWD" "$4" "$PWD" "$4"
  exit 0
fi
`;

// The stub openspec's answer to `openspec archive <change> --yes`: it moves the change under the archive
// as OpenSpec 1.14.0 does, or, while the marker file exists, refuses as OpenSpec does on a failed validation.
function archiveStub(marker: string): string {
  return `if [ "$1" = archive ]; then
  if [ $# -ne 3 ] || [ "$3" != --yes ]; then
    echo "unexpected archive arguments: $*"
    exit 2
  fi
  if [ -e ${JSON.stringify(marker)} ]; then
    echo "Validation failed. Please fix the errors before archiving."
    exit 1
  fi
  mkdir -p openspec/changes/archive && mv "openspec/changes/$2" "openspec/changes/archive/2026-01-01-$2" && echo "Change '$2' archived as '2026-01-01-$2'."
  exit $?
fi
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
  // Installs a stub openspec reporting the version and answering `instructions apply` and `archive` as OpenSpec 1.14.0 does.
  setOpenSpec(version: string | null): void;
  // Makes the stub openspec refuse to archive, or, with false, archive again.
  refuseArchive(refuse?: boolean): void;
  // Creates a bare repository as origin, pushes the default branch to it and makes it the upstream. Returns its path.
  addOrigin(): string;
  // The arguments of every stub gh call, in order.
  ghCalls(): string[][];
  // Makes the stub gh's `pr create` exit 1 after opening the pull request, or, with false, succeed again.
  failPrCreate(fail?: boolean): void;
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
  delivery?: string;
}

type After = { after: (fn: () => void) => void };

export function makeRepo(t: After, options: RepoOptions = {}): Repo {
  const change = options.change ?? "add-thing";
  const defaultBranch = options.defaultBranch ?? "main";
  const base = realpathSync(mkdtempSync(join(tmpdir(), "loop-test-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const top = join(base, "repo");
  const bin = join(base, "bin");
  const queuePath = join(base, "queue.json");
  const logPath = join(base, "calls.jsonl");
  const archiveMarker = join(base, "refuse-archive");
  const ghLog = join(base, "gh.jsonl");
  const ghFailMarker = join(base, "fail-pr-create");
  mkdirSync(top);
  mkdirSync(bin);
  const gitConfig = join(base, "gitconfig");
  writeFileSync(gitConfig, "");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}${delimiter}${BASE_PATH}`,
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
    setOpenSpec(version) {
      const stub = join(bin, "openspec");
      rmSync(stub, { force: true });
      if (version === null) return;
      writeFileSync(stub, `#!/bin/sh\n${APPLY}${archiveStub(archiveMarker)}echo ${version}\n`);
      chmodSync(stub, 0o755);
    },
    refuseArchive(refuse = true) {
      if (refuse) writeFileSync(archiveMarker, "");
      else rmSync(archiveMarker, { force: true });
    },
    addOrigin() {
      const origin = join(base, "origin.git");
      gitIn(base, "init", "--quiet", "--bare", "-b", defaultBranch, origin);
      repo.git("remote", "add", "origin", origin);
      repo.git("push", "--quiet", "-u", "origin", defaultBranch);
      return origin;
    },
    ghCalls() {
      return existsSync(ghLog) ? readFileSync(ghLog, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [];
    },
    failPrCreate(fail = true) {
      if (fail) writeFileSync(ghFailMarker, "");
      else rmSync(ghFailMarker, { force: true });
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
  writeFileSync(join(bin, "gh"), stubGh(join(base, "prs.json"), ghLog, ghFailMarker));
  chmodSync(join(bin, "gh"), 0o755);
  repo.setOpenSpec(options.openspec === undefined ? "1.14.0" : options.openspec);

  repo.git("init", "--quiet", "-b", defaultBranch);
  // Ignored as the README tells users to, so a run leaves the checkout's status unchanged.
  writeFileSync(join(top, ".git", "info", "exclude"), ".worktrees/\n", { flag: "a" });
  writeFile(top, "openspec/loop.yaml", configYaml(defaultBranch, options.delivery));
  repo.git("add", ".");
  repo.git("commit", "--quiet", "-m", "init");
  if (options.branch !== undefined && options.branch !== defaultBranch) repo.git("switch", "--quiet", "-c", options.branch);
  writeFile(top, `openspec/changes/${change}/proposal.md`, "## Why\n\nTest.\n");
  writeFile(top, `openspec/changes/${change}/tasks.md`, "## 1. Work\n\n- [ ] 1.1 Do the thing\n");
  repo.git("add", ".");
  repo.git("commit", "--quiet", "-m", "propose");
  return repo;
}

// The patch ID the loop records for the change from base to tip, outside the change's directory.
export function patchIdOf(repo: Repo, base: string, tip: string): string {
  return execFileSync("sh", ["-c", `git diff --unified=0 ${base} ${tip} -- ':(top,exclude)openspec/changes/add-thing' | git patch-id --verbatim`], { cwd: repo.top, env: repo.env, encoding: "utf8" }).split(" ")[0];
}

// The short hash of the latest commit with this subject on the run's branch.
export function commitWith(repo: Repo, subject: string, branch = "loop/add-thing"): string {
  const line = repo.git("log", "--format=%H %s", branch).split("\n").find((entry) => entry.slice(41) === subject);
  if (!line) throw new Error(`no commit "${subject}" on ${branch}`);
  return repo.git("rev-parse", "--short=7", line.slice(0, 40));
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
