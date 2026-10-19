import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { BIN, loop, makeRepo, type Repo, runLoop, writeFile } from "./helpers.js";

// An npm-style installation: the loop symlink beside its sibling commands in the fixture bin.
function siblingLoop(repo: Repo): string {
  const link = join(repo.root, "bin", "loop");
  symlinkSync(BIN, link);
  return link;
}

// The inherited PATH a shell supplies when it launches loop by path without its bin directory.
function withoutBin(repo: Repo): string {
  return repo.env.PATH!.split(delimiter).filter((dir) => dir !== join(repo.root, "bin")).join(delimiter);
}

test("loop prints usage and exits 2", (t) => {
  const repo = makeRepo(t);
  for (const args of [[], ["run"], ["step"], ["unknown", "add-thing"], ["run", "add-thing", "extra"], ["step", "add-thing", "extra"], ["run", "add-thing", "a", "b", "c"],
    ["scope"], ["scope", "start"], ["scope", "finish"], ["scope", "other", "session"], ["scope", "start", "session", "extra"], ["scope", "finish", "session", "--force"]]) {
    const result = loop(args, { cwd: repo.top, env: repo.env });
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /^Usage: loop /);
  }
});

test("status of a change with no run exits 2", (t) => {
  const repo = makeRepo(t);
  const result = runLoop(repo, ["status", "add-thing"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /add-thing has no run; start one with `loop run add-thing`/);
});

test("--attempts, --implement and --review are accepted only on resume, each once, --attempts as a positive integer", (t) => {
  const repo = makeRepo(t);
  const malformed = [
    ["run", "add-thing", "--attempts", "1"],
    ["status", "add-thing", "--attempts", "1"],
    ["step", "add-thing", "--attempts", "1"],
    ["resume", "add-thing", "--attempts"],
    ["resume", "add-thing", "--attempts", "0"],
    ["resume", "add-thing", "--attempts", "1.5"],
    ["resume", "add-thing", "--attempts", "two"],
    ["resume", "add-thing", "--attempts", "9".repeat(400)],
    ["run", "add-thing", "--implement"],
    ["status", "add-thing", "--implement"],
    ["step", "add-thing", "--implement"],
    ["resume", "add-thing", "--implement", "--implement"],
    ["run", "add-thing", "--review"],
    ["status", "add-thing", "--review"],
    ["step", "add-thing", "--review"],
    ["resume", "add-thing", "--review", "--review"],
    ["resume", "add-thing", "--attempts", "1", "--attempts", "2"],
  ];
  for (const args of malformed) {
    const result = loop(args, { cwd: repo.top, env: repo.env });
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /^Usage: loop /, args.join(" "));
  }
  for (const extra of [["--attempts", "2"], ["--implement"], ["--review"], ["--implement", "--attempts", "2"], ["--attempts", "2", "--implement"], ["--implement", "--review"], ["--review", "--attempts", "2"]]) {
    const accepted = runLoop(repo, ["resume", "add-thing", ...extra]);
    assert.equal(accepted.status, 2, extra.join(" "));
    assert.match(accepted.stderr, /add-thing has no run/, extra.join(" "));
  }
});

test("run, step and resume accept four agent aliases, resume also before its options", (t) => {
  const repo = makeRepo(t);
  for (const args of [["run", "add-thing"], ["step", "add-thing"], ["resume", "add-thing"]]) {
    const result = runLoop(repo, [...args, "reviewer", "ghost", "implementer", "verifier", ...(args[0] === "resume" ? ["--attempts", "2"] : [])]);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /role planReviser names agent "ghost", which the configuration does not define/, args.join(" "));
  }
  assert.equal(existsSync(repo.worktree), false);
});

for (const command of ["run", "step"]) {
  test(`${command} refuses a role whose agent cannot be found, naming the role and the alias`, (t) => {
    const repo = makeRepo(t);
    writeFile(repo.top, "openspec/loop.local.yaml", "agents:\n  ghost: [no-such-adapter]\nroles:\n  planReviser: ghost\n");
    const result = runLoop(repo, [command, "add-thing"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /role planReviser uses agent "ghost", whose command no-such-adapter is not an executable file on PATH/);
  });
}

test("a loop invoked by path finds its sibling commands when its bin directory is absent from PATH", (t) => {
  const repo = makeRepo(t);
  const link = siblingLoop(repo);
  const worktree = join(repo.root, "linked");
  repo.git("worktree", "add", "--quiet", "-b", "linked", worktree);
  const result = spawnSync(process.execPath, [link, "step", "add-thing"], {
    cwd: worktree,
    env: { ...repo.env, PATH: withoutBin(repo) },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const [call] = repo.calls("reviewer");
  assert.equal(call.cwd, worktree);
});

test("an earlier PATH entry keeps precedence over a command beside the invoked loop", (t) => {
  const repo = makeRepo(t);
  const link = siblingLoop(repo);
  const earlier = join(repo.root, "earlier");
  mkdirSync(earlier);
  const marker = join(repo.root, "earlier-stub-ran");
  const stub = join(earlier, "stub-agent");
  writeFileSync(stub, `#!/bin/sh\ntouch "${marker}"\nexit 7\n`);
  chmodSync(stub, 0o755);
  const result = spawnSync(process.execPath, [link, "step", "add-thing"], {
    cwd: repo.top,
    env: { ...repo.env, PATH: [earlier, withoutBin(repo)].join(delimiter) },
    encoding: "utf8",
  });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /exit status 7/);
  assert.ok(existsSync(marker));
  assert.equal(repo.calls("reviewer").length, 0);
});

test("with PATH removed the launch directory alone still finds a sibling command", (t) => {
  const repo = makeRepo(t);
  const link = siblingLoop(repo);
  // PATH becomes the launch directory alone, so it also carries the external prerequisites.
  symlinkSync(process.execPath, join(repo.root, "bin", "node"));
  symlinkSync(execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim(), join(repo.root, "bin", "git"));
  const env = { ...repo.env };
  delete env.PATH;
  const result = spawnSync(process.execPath, [link, "step", "add-thing"], { cwd: repo.top, env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(repo.calls("reviewer").length, 1);
});
