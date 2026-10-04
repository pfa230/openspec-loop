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
  top: string;
  env: NodeJS.ProcessEnv;
  git(...args: string[]): string;
  gitIn(cwd: string, ...args: string[]): string;
  runDir(change?: string): string;
  setFixture(commands: Record<string, string>): void;
  setOpenSpec(version: string | null): void;
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
    top,
    env,
    git: (...args) => gitIn(top, ...args),
    gitIn,
    runDir: (name = change) => join(top, ".git", "openspec-loop", name),
    setFixture(commands) {
      const all = { ...Object.fromEntries(STAGES.map((stage) => [stage, "true"])), ...commands };
      writeFileSync(fixturePath, Object.entries(all).map(([stage, command]) => `${stage}: ${JSON.stringify(command)}\n`).join(""));
    },
    setOpenSpec(version) {
      const stub = join(bin, "openspec");
      rmSync(stub, { force: true });
      if (version === null) return;
      writeFileSync(stub, `#!/bin/sh\necho ${version}\n`);
      chmodSync(stub, 0o755);
    },
  };
  repo.setOpenSpec(options.openspec === undefined ? "1.14.0" : options.openspec);
  repo.setFixture(options.fixture ?? {});

  repo.git("init", "--quiet", "-b", defaultBranch);
  writeFile(top, "openspec/loop.yaml", `defaultBranch: ${defaultBranch}\n`);
  repo.git("add", ".");
  repo.git("commit", "--quiet", "-m", "init");
  if (options.branch !== undefined && options.branch !== defaultBranch) repo.git("switch", "--quiet", "-c", options.branch);
  writeFile(top, `openspec/changes/${change}/proposal.md`, "## Why\n\nTest.\n");
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
  stdout(): string;
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
    stdout: () => stdout,
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
