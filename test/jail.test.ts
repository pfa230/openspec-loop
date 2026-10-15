import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const JAIL = fileURLToPath(new URL(pkg.bin["loop-jail"], root));

// A stub ai-jail: records its arguments and runs the command after -- outside any jail, exiting with its status.
const AI_JAIL = `#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
fs.writeFileSync(process.env.STUB_LOG, JSON.stringify(args));
const [command, ...rest] = args.slice(args.indexOf("--") + 1);
process.exit(spawnSync(command, rest, { stdio: "inherit" }).status ?? 1);
`;

// A stub worker: writes its reply and usage to the last two arguments and exits with a chosen status.
const WORKER = `#!/usr/bin/env node
const fs = require("node:fs");
const [reply, usage] = process.argv.slice(-2);
fs.writeFileSync(reply, '{"ok":true}\\n');
fs.writeFileSync(usage, '{"inputTokens":1}\\n');
process.exit(Number(process.env.STUB_EXIT || 0));
`;

function executable(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function jail(t: { after: (fn: () => void) => void }, command: string[], env: Record<string, string> = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "loop-jail-test-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repo = join(base, "repo");
  const worktree = join(repo, ".worktrees", "w");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  mkdirSync(repo);
  git("init", "--quiet", "-b", "main");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "--allow-empty", "-m", "init");
  git("worktree", "add", "--quiet", worktree);
  executable(join(worktree, "worker"), WORKER);
  const bin = join(base, "bin");
  executable(join(bin, "ai-jail"), AI_JAIL);
  executable(join(bin, "loop-claude"), "#!/bin/sh\n");
  // openspec installed as npm does it, reached through a ~/.local/bin-style link.
  executable(join(base, "npm", "lib", "node_modules", "@scope", "openspec", "bin", "openspec.js"), "#!/bin/sh\n");
  mkdirSync(join(base, "npm", "bin"));
  symlinkSync("../lib/node_modules/@scope/openspec/bin/openspec.js", join(base, "npm", "bin", "openspec"));
  mkdirSync(join(base, "local"));
  symlinkSync(join(base, "npm", "bin", "openspec"), join(base, "local", "openspec"));
  const run = join(repo, ".git", "openspec-loop", "run");
  mkdirSync(run, { recursive: true });
  writeFileSync(join(run, "prompt.md"), "Do the work.\n");
  writeFileSync(join(run, "schema.json"), "{}\n");
  const paths = ["prompt.md", "schema.json", "reply.json", "usage.json"].map((file) => join(run, file));
  const log = join(base, "ai-jail.json");
  const result = spawnSync(process.execPath, [JAIL, ...command, ...paths], {
    cwd: worktree,
    encoding: "utf8",
    env: { ...process.env, HOME: join(base, "home"), PATH: [bin, join(base, "local"), process.env.PATH].join(delimiter), STUB_LOG: log, ...env },
  });
  const args: string[] = existsSync(log) ? JSON.parse(readFileSync(log, "utf8")) : [];
  const flags = args.slice(0, args.indexOf("--"));
  const mapped = (flag: string) => flags.flatMap((arg, i) => (flags[i - 1] === flag ? [arg] : []));
  const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : undefined);
  return { base, repo, worktree, result, flags, readOnly: mapped("--map"), writable: mapped("--rw-map"), reply: read(paths[2]), usage: read(paths[3]) };
}

test("loop-jail maps the Git metadata and executables read-only and delivers the reply and usage with the command's status", (t) => {
  const { base, repo, worktree, result, flags, readOnly, writable, reply, usage } = jail(t, ["./worker"], { STUB_EXIT: "3" });
  assert.equal(result.status, 3, result.stderr);
  assert.equal(reply, '{"ok":true}\n');
  assert.equal(usage, '{"inputTokens":1}\n');
  assert.deepEqual(flags.slice(0, 3), ["--exec", "--network", "--no-save-config"]);
  for (const path of [join(repo, ".git"), join(worktree, ".git"), join(base, "local"), join(base, "npm", "bin"), join(base, "npm", "lib", "node_modules", "@scope", "openspec")]) {
    assert.ok(readOnly.includes(path), `${path} is mapped read-only`);
  }
  assert.deepEqual([...readOnly, ...writable].filter((path) => path.startsWith(worktree + sep) || path === worktree), [join(worktree, ".git")]);
  assert.equal(writable.length, 1);
  assert.ok(!existsSync(writable[0]), "the relay directory is removed");
});

test("loop-jail shares Claude Code's credential file writable and its settings and instructions read-only", (t) => {
  const { base, result, readOnly, writable } = jail(t, ["loop-claude", "--model", "opus"]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(writable.includes(join(base, "home", ".claude", ".credentials.json")));
  assert.ok(readOnly.includes(join(base, "home", ".claude", "settings.json")));
  assert.ok(readOnly.includes(join(base, "home", ".claude", "CLAUDE.md")));
});

test("loop-jail fails naming ai-jail when it is not installed", (t) => {
  const gitDir = mkdtempSync(join(tmpdir(), "loop-jail-git-"));
  t.after(() => rmSync(gitDir, { recursive: true, force: true }));
  symlinkSync(execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim(), join(gitDir, "git"));
  const { result } = jail(t, ["./worker"], { PATH: gitDir });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ai-jail/);
});
