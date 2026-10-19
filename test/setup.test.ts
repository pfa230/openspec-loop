import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { type Repo, loop, makeRepo, runLoop, writeFile } from "./helpers.js";

const bundled = fileURLToPath(new URL("../../skills/", import.meta.url));
const tools = [".agents", ".claude"];

function contents(directory: string): Record<string, string> {
  return Object.fromEntries(readdirSync(directory, { recursive: true }).map(String).sort()
    .filter(path => statSync(join(directory, path)).isFile())
    .map(path => [path, readFileSync(join(directory, path), "utf8")]));
}

function relocatedPackage(repo: Repo): string {
  const directory = join(repo.root, "installed package");
  mkdirSync(directory);
  cpSync(fileURLToPath(new URL("../../package.json", import.meta.url)), join(directory, "package.json"));
  cpSync(fileURLToPath(new URL("../src/", import.meta.url)), join(directory, "dist", "src"), { recursive: true });
  symlinkSync(fileURLToPath(new URL("../../node_modules/", import.meta.url)), join(directory, "node_modules"), "dir");
  return directory;
}

function setupFrom(directory: string, repo: Repo) {
  return spawnSync(process.execPath, [join(directory, "dist", "src", "cli.js"), "setup"], { cwd: repo.top, env: repo.env, encoding: "utf8" });
}

function installed(top: string, expected = contents(bundled)): void {
  for (const tool of tools) assert.deepEqual(contents(join(top, tool, "skills")), expected);
}

test("setup installs every bundled skill for both tools and reports each destination", (t) => {
  const repo = makeRepo(t);
  const result = runLoop(repo, ["setup"]);
  assert.equal(result.status, 0, result.stderr);
  installed(repo.top);
  const destinations = tools.flatMap(tool => ["openspec-loop", "openspec-proposals", "openspec-scope"].map(skill => `Installed ${join(repo.top, tool, "skills", skill)}`));
  assert.deepEqual(result.stdout.trim().split("\n"), destinations);
});

test("setup targets the checkout root from a subdirectory", (t) => {
  const repo = makeRepo(t);
  const nested = join(repo.top, "nested", "directory");
  mkdirSync(nested, { recursive: true });
  const result = runLoop(repo, ["setup"], nested);
  assert.equal(result.status, 0, result.stderr);
  installed(repo.top);
  for (const tool of tools) assert.equal(existsSync(join(nested, tool)), false);
});

test("setup targets only the invoking linked worktree", (t) => {
  const repo = makeRepo(t);
  const worktree = join(repo.root, "linked");
  repo.git("worktree", "add", "--quiet", "-b", "linked", worktree);
  const result = runLoop(repo, ["setup"], worktree);
  assert.equal(result.status, 0, result.stderr);
  installed(worktree);
  for (const tool of tools) assert.equal(existsSync(join(repo.top, tool)), false);
});

test("setup needs no OpenSpec root, loop configuration or worker executable", (t) => {
  const repo = makeRepo(t, { openspec: null });
  rmSync(join(repo.top, "openspec"), { recursive: true });
  rmSync(join(repo.root, "bin", "stub-agent"));
  const result = runLoop(repo, ["setup"]);
  assert.equal(result.status, 0, result.stderr);
  installed(repo.top);
  assert.equal(existsSync(join(repo.top, "openspec")), false);
  assert.equal(existsSync(repo.runDir()), false);
});

test("setup refuses every extra argument before writing files", (t) => {
  const repo = makeRepo(t);
  for (const args of [["setup", "extra"], ["setup", "--force"], ["setup", "--attempts", "1"], ["setup", "--implement"]]) {
    const result = loop(args, { cwd: repo.top, env: repo.env });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^Usage: loop /);
    assert.match(result.stderr, /loop setup/);
    for (const tool of tools) assert.equal(existsSync(join(repo.top, tool)), false);
  }
});

test("setup refreshes old supervision copies, adds missing scoping and proposal skills and preserves unrelated skills", (t) => {
  const repo = makeRepo(t);
  for (const tool of tools) {
    writeFile(repo.top, `${tool}/skills/openspec-loop/SKILL.md`, "old locally edited supervision");
    writeFile(repo.top, `${tool}/skills/openspec-loop/obsolete/helper.md`, "obsolete instructions");
    writeFile(repo.top, `${tool}/skills/openspec-propose/SKILL.md`, "native OpenSpec skill");
    writeFile(repo.top, `${tool}/skills/custom/SKILL.md`, "custom skill");
    writeFile(repo.top, `${tool}/skills/.openspec-target`, "native target metadata");
  }
  const result = runLoop(repo, ["setup"]);
  assert.equal(result.status, 0, result.stderr);
  for (const tool of tools) {
    for (const skill of ["openspec-loop", "openspec-proposals", "openspec-scope"]) {
      assert.deepEqual(contents(join(repo.top, tool, "skills", skill)), contents(join(bundled, skill)));
    }
    assert.equal(readFileSync(join(repo.top, tool, "skills", "openspec-propose", "SKILL.md"), "utf8"), "native OpenSpec skill");
    assert.equal(readFileSync(join(repo.top, tool, "skills", "custom", "SKILL.md"), "utf8"), "custom skill");
    assert.equal(readFileSync(join(repo.top, tool, "skills", ".openspec-target"), "utf8"), "native target metadata");
    assert.equal(existsSync(join(repo.top, tool, "skills", "openspec-loop", "obsolete")), false);
  }
});

test("repeated setup leaves installed contents identical", (t) => {
  const repo = makeRepo(t);
  assert.equal(runLoop(repo, ["setup"]).status, 0);
  const before = tools.map(tool => contents(join(repo.top, tool, "skills")));
  const result = runLoop(repo, ["setup"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(tools.map(tool => contents(join(repo.top, tool, "skills"))), before);
});

test("setup preserves configuration, ignore files, refs, index and existing run state", (t) => {
  const repo = makeRepo(t);
  writeFile(repo.top, "openspec/loop.local.yaml", "unreadable as loop YAML: [");
  writeFile(repo.top, "openspec/config.yaml", "schema: spec-driven\n");
  writeFile(repo.top, ".gitignore", "custom-ignore/\n");
  writeFile(repo.top, "staged.txt", "staged change");
  repo.git("add", "staged.txt");
  writeFile(repo.top, "staged.txt", "unstaged change");
  writeFile(repo.runDir(), "state.json", "existing run state");
  const paths = ["openspec/loop.yaml", "openspec/loop.local.yaml", "openspec/config.yaml", ".gitignore", ".git/config", ".git/index", ".git/openspec-loop/add-thing/state.json", "staged.txt"];
  const files = paths.map(path => readFileSync(join(repo.top, path)));
  const refs = repo.git("show-ref");
  const staged = repo.git("diff", "--cached");
  const result = runLoop(repo, ["setup"]);
  assert.equal(result.status, 0, result.stderr);
  installed(repo.top);
  assert.deepEqual(paths.map(path => readFileSync(join(repo.top, path))), files);
  assert.equal(repo.git("show-ref"), refs);
  assert.equal(repo.git("diff", "--cached"), staged);
});

test("setup refuses outside a Git working tree without creating files", (t) => {
  const repo = makeRepo(t);
  const before = readdirSync(repo.root);
  const result = loop(["setup"], { cwd: repo.root, env: repo.env });
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes(repo.root));
  assert.match(result.stderr, /not inside a Git working tree/);
  assert.equal(result.stdout, "");
  assert.deepEqual(readdirSync(repo.root), before);
});

for (const kind of ["file", "symlink"]) {
  for (const path of [".agents", ".agents/skills", ".agents/skills/openspec-loop", ".claude", ".claude/skills", ".claude/skills/openspec-scope"]) {
    test(`setup refuses a ${kind} at ${path} before updating either tool`, (t) => {
      const repo = makeRepo(t);
      const other = path.startsWith(".agents") ? ".claude" : ".agents";
      const unchanged = join(repo.top, other, "skills", "openspec-loop", "SKILL.md");
      writeFile(repo.top, `${other}/skills/openspec-loop/SKILL.md`, "unchanged copy");
      const target = join(repo.root, "external target");
      writeFile(target, "marker.txt", "external content");
      const obstruction = join(repo.top, path);
      mkdirSync(dirname(obstruction), { recursive: true });
      if (kind === "file") writeFile(repo.top, path, "obstructing file");
      else symlinkSync(target, obstruction, "dir");
      const before = repo.git("status", "--porcelain=v1", "--untracked-files=all");
      const result = runLoop(repo, ["setup"]);
      assert.equal(result.status, 2, result.stderr);
      assert.ok(result.stderr.includes(obstruction), result.stderr);
      assert.equal(result.stdout, "");
      assert.equal(readFileSync(unchanged, "utf8"), "unchanged copy");
      assert.deepEqual(contents(target), { "marker.txt": "external content" });
      assert.equal(lstatSync(obstruction).isSymbolicLink(), kind === "symlink");
      if (kind === "file") assert.equal(readFileSync(obstruction, "utf8"), "obstructing file");
      assert.equal(repo.git("status", "--porcelain=v1", "--untracked-files=all"), before);
    });
  }
}

test("setup reports a missing package skills directory and succeeds after it is restored", (t) => {
  const repo = makeRepo(t);
  const directory = relocatedPackage(repo);
  const source = join(directory, "skills");
  const failed = setupFrom(directory, repo);
  assert.equal(failed.status, 1, failed.stderr);
  assert.ok(failed.stderr.includes(source), failed.stderr);
  assert.equal(failed.stdout, "");
  for (const tool of tools) assert.equal(existsSync(join(repo.top, tool)), false);
  cpSync(bundled, source, { recursive: true });
  const repaired = setupFrom(directory, repo);
  assert.equal(repaired.status, 0, repaired.stderr);
  installed(repo.top);
});

test("setup uses all skills from the executing package rather than the project or npm prefix", (t) => {
  const repo = makeRepo(t);
  const directory = relocatedPackage(repo);
  for (const skill of ["openspec-loop", "openspec-scope", "additional-bundled-skill"]) {
    writeFile(directory, `skills/${skill}/SKILL.md`, `installed package: ${skill}`);
    writeFile(directory, `skills/${skill}/references/detail.md`, `packaged reference: ${skill}`);
    writeFile(repo.top, `skills/${skill}/SKILL.md`, `wrong project source: ${skill}`);
  }
  const prefix = join(repo.root, "different npm prefix");
  writeFile(prefix, "lib/node_modules/openspec-loop/skills/openspec-loop/SKILL.md", "wrong npm source");
  repo.env.npm_config_prefix = prefix;
  repo.env.NPM_CONFIG_PREFIX = prefix;
  const result = setupFrom(directory, repo);
  assert.equal(result.status, 0, result.stderr);
  installed(repo.top, contents(join(directory, "skills")));
  assert.equal(readFileSync(join(repo.top, "skills", "openspec-loop", "SKILL.md"), "utf8"), "wrong project source: openspec-loop");
  assert.equal(readFileSync(join(prefix, "lib", "node_modules", "openspec-loop", "skills", "openspec-loop", "SKILL.md"), "utf8"), "wrong npm source");
});
