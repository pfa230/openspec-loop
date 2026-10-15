#!/usr/bin/env node
// loop-jail: runs the worker command given as its arguments under ai-jail. The worker can write the worktree, a private
// /tmp and home, and its harness's credential file; the repository's Git metadata and the harness's configuration are
// read-only. Since the run directory lies inside the read-only Git directory, the wrapped command writes its reply and
// usage to a writable host directory, and the wrapper copies them to the loop's paths after it exits.
import { spawn } from "node:child_process";
import { accessSync, constants, copyFileSync, existsSync, lstatSync, mkdtempSync, readlinkSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve, sep } from "node:path";
import { fail } from "./adapters/common.js";
import { git } from "./git.js";

const argv = process.argv.slice(2);
if (argv.length < 5) fail("expected a command followed by the prompt, schema, reply and usage paths");
const [command, ...rest] = argv.slice(0, -2);
const [replyPath, usagePath] = argv.slice(-2);
const worktree = process.cwd();
const home = homedir();

// The harness each shipped adapter runs, with the files it shares writable and read-only.
const HARNESSES: Record<string, { harness: string; writable: string[]; readOnly: string[] }> = {
  "loop-claude": { harness: "claude", writable: [".claude/.credentials.json"], readOnly: [".claude/settings.json", ".claude/CLAUDE.md"] },
  "loop-codex": { harness: "codex", writable: [".codex/auth.json"], readOnly: [".codex/config.toml"] },
  "loop-agy": { harness: "agy", writable: [".gemini/antigravity-cli/antigravity-oauth-token"], readOnly: [".gemini/antigravity-cli/settings.json"] },
  "loop-opencode": { harness: "opencode", writable: [".local/share/opencode/auth.json"], readOnly: [".config/opencode"] },
};
const shipped = HARNESSES[basename(command)];

const inWorktree = (path: string) => path === worktree || path.startsWith(worktree + sep);

// The command's path as the shell would run it, or undefined when it is not found on PATH.
function which(name: string): string | undefined {
  const candidates = name.includes("/") ? [resolve(name)] : (process.env.PATH ?? "").split(delimiter).map((dir) => resolve(dir, name));
  for (const path of candidates) {
    try {
      accessSync(path, constants.X_OK);
      return path;
    } catch {}
  }
  return undefined;
}

// The directories that make a command runnable: the directory of every symlink hop, and the final file's directory,
// or its npm package directory when the file lies under node_modules.
function chain(name: string): string[] {
  let path = which(name);
  if (!path) return [];
  const dirs: string[] = [];
  while (lstatSync(path).isSymbolicLink()) {
    dirs.push(dirname(path));
    path = resolve(dirname(path), readlinkSync(path));
  }
  const parts = path.split(sep);
  const modules = parts.lastIndexOf("node_modules");
  if (modules < 0 || modules + 1 >= parts.length - 1) dirs.push(dirname(path));
  else dirs.push(parts.slice(0, modules + (parts[modules + 1].startsWith("@") ? 3 : 2)).join(sep));
  return dirs;
}

const readOnly = new Set([git(worktree, "rev-parse", "--path-format=absolute", "--git-common-dir"), join(worktree, ".git")]);
const executables = [command, shipped?.harness, "openspec"].filter((name): name is string => name !== undefined);
for (const dir of executables.flatMap(chain)) if (!inWorktree(dir)) readOnly.add(dir);
for (const file of shipped?.readOnly ?? []) readOnly.add(join(home, file));

const relay = mkdtempSync(join(tmpdir(), "loop-jail-"));
const writable = [relay, ...(shipped?.writable ?? []).map((file) => join(home, file))];
const relayed = [join(relay, "reply.json"), join(relay, "usage.json")];
const args = [
  "--exec", "--network", "--no-save-config",
  ...[...readOnly].flatMap((path) => ["--map", path]),
  ...writable.flatMap((path) => ["--rw-map", path]),
  "--", command, ...rest, ...relayed,
];

const child = spawn("ai-jail", args, { stdio: "inherit" });
const { code, error } = await new Promise<{ code: number | null; error?: Error }>((done) => {
  child.once("error", (error) => done({ code: null, error }));
  child.once("close", (code) => done({ code }));
});
relayed.forEach((path, i) => {
  if (existsSync(path)) copyFileSync(path, [replyPath, usagePath][i]);
});
rmSync(relay, { recursive: true, force: true });
if (error) fail(`cannot run ai-jail: ${error.message}`);
process.exit(code ?? 1);
