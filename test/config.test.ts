import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type Config, readConfig, resolveRoles } from "../src/config.js";
import { Refusal } from "../src/refusal.js";

type After = { after: (fn: () => void) => void };

const VALID = `defaultBranch: trunk
worktrees: .worktrees
agents:
  gpt: [loop-codex, -m, gpt-5.5]
  opus: [loop-claude, --model, opus]
roles:
  proposalReviewer: gpt
  planReviser: opus
  implementer: opus
  implementationReviewer: gpt
attempts:
  proposalReview: 3
  implementation: 2
checks:
  - npm test
delivery: merge
`;

function checkout(t: After, yaml?: string, local?: string): string {
  const top = realpathSync(mkdtempSync(join(tmpdir(), "loop-config-")));
  t.after(() => rmSync(top, { recursive: true, force: true }));
  mkdirSync(join(top, "openspec"));
  if (yaml !== undefined) writeFileSync(join(top, "openspec/loop.yaml"), yaml);
  if (local !== undefined) writeFileSync(join(top, "openspec/loop.local.yaml"), local);
  return top;
}

function refuses(fn: () => unknown, message: RegExp): void {
  assert.throws(fn, (error: unknown) => error instanceof Refusal && message.test(error.message));
}

test("a valid configuration returns every field", (t) => {
  assert.deepEqual(readConfig(checkout(t, VALID)), {
    defaultBranch: "trunk",
    worktrees: ".worktrees",
    agents: { gpt: ["loop-codex", "-m", "gpt-5.5"], opus: ["loop-claude", "--model", "opus"] },
    roles: { proposalReviewer: "gpt", planReviser: "opus", implementer: "opus", implementationReviewer: "gpt" },
    attempts: { proposalReview: 3, implementation: 2 },
    checks: ["npm test"],
    delivery: "merge",
  });
});

test("a missing file is refused", (t) => {
  refuses(() => readConfig(checkout(t)), /openspec\/loop\.yaml not found/);
});

const refusals: Record<string, [string, RegExp]> = {
  "unparseable YAML": ["defaultBranch: [main\n", /loop\.yaml is not valid YAML/],
  "a non-mapping document": ["- main\n", /loop\.yaml must be a mapping/],
  "a missing default branch": [VALID.replace("defaultBranch: trunk\n", ""), /loop\.yaml is missing "defaultBranch"/],
  "missing worktrees": [VALID.replace("worktrees: .worktrees\n", ""), /loop\.yaml is missing "worktrees"/],
  "a worktrees directory that is not a string": [VALID.replace("worktrees: .worktrees", "worktrees: [.worktrees]"), /loop\.yaml: "worktrees" must be a non-empty path/],
  "a missing role": [VALID.replace("  planReviser: opus\n", ""), /loop\.yaml is missing "roles\.planReviser"/],
  "missing attempts": [VALID.replace("attempts:\n  proposalReview: 3\n  implementation: 2\n", ""), /loop\.yaml is missing "attempts\.proposalReview", "attempts\.implementation"/],
  "a missing implementer": [VALID.replace("  implementer: opus\n", ""), /loop\.yaml is missing "roles\.implementer"/],
  "missing checks": [VALID.replace("checks:\n  - npm test\n", ""), /loop\.yaml is missing "checks"/],
  "checks that are not a list": [VALID.replace("checks:\n  - npm test\n", "checks: npm test\n"), /loop\.yaml: "checks" must be a list of non-empty commands/],
  "an empty check": [VALID.replace("  - npm test\n", "  - npm test\n  - \"\"\n"), /loop\.yaml: "checks" must be a list of non-empty commands/],
  "an unknown top-level key": [`${VALID}remote: origin\n`, /loop\.yaml has unknown key "remote"/],
  "missing delivery": [VALID.replace("delivery: merge\n", ""), /loop\.yaml is missing "delivery"/],
  "an unknown delivery mode": [VALID.replace("delivery: merge", "delivery: push"), /loop\.yaml: "delivery" must be one of local, pr, merge/],
  "an unknown role": [VALID.replace("roles:\n", "roles:\n  tester: opus\n"), /loop\.yaml has unknown key "roles\.tester"/],
  "an unknown attempt budget": [VALID.replace("attempts:\n", "attempts:\n  review: 2\n"), /loop\.yaml has unknown key "attempts\.review"/],
  "an empty default branch": [VALID.replace("trunk", '""'), /"defaultBranch" must be a non-empty branch name/],
  "agents that are not a mapping": [VALID.replace(/agents:\n.*\n.*\n/, "agents: [gpt]\n"), /"agents" must be a mapping/],
  "an agent that is not a list": [VALID.replace("[loop-codex, -m, gpt-5.5]", "loop-codex"), /"agents\.gpt" must be a non-empty list/],
  "an empty agent": [VALID.replace("[loop-codex, -m, gpt-5.5]", "[]"), /"agents\.gpt" must be a non-empty list/],
  "an agent with a non-string part": [VALID.replace("gpt-5.5]", "5]"), /"agents\.gpt" must be a non-empty list of non-empty strings/],
  "a role that is not an alias": [VALID.replace("planReviser: opus", "planReviser: [opus]"), /"roles\.planReviser" must be an agent alias/],
  "a zero attempt budget": [VALID.replace("proposalReview: 3", "proposalReview: 0"), /"attempts\.proposalReview" must be a positive integer/],
  "a fractional attempt budget": [VALID.replace("proposalReview: 3", "proposalReview: 1.5"), /"attempts\.proposalReview" must be a positive integer/],
};

for (const [name, [yaml, message]] of Object.entries(refusals)) {
  test(`${name} is refused`, (t) => {
    refuses(() => readConfig(checkout(t, yaml)), message);
  });
}

test("the local file replaces only the entries it sets", (t) => {
  const local = "agents:\n  deepseek: [loop-opencode, -m, deepseek/v4]\nroles:\n  proposalReviewer: deepseek\n";
  const config = readConfig(checkout(t, VALID, local));
  assert.deepEqual(config.agents, {
    gpt: ["loop-codex", "-m", "gpt-5.5"],
    opus: ["loop-claude", "--model", "opus"],
    deepseek: ["loop-opencode", "-m", "deepseek/v4"],
  });
  assert.deepEqual(config.roles, { proposalReviewer: "deepseek", planReviser: "opus", implementer: "opus", implementationReviewer: "gpt" });
  assert.equal(config.defaultBranch, "trunk");
});

test("a local worktrees directory replaces the committed one", (t) => {
  assert.equal(readConfig(checkout(t, VALID, "worktrees: /srv/worktrees\n")).worktrees, "/srv/worktrees");
});

test("a local delivery mode replaces the committed one", (t) => {
  assert.equal(readConfig(checkout(t, VALID, "delivery: local\n")).delivery, "local");
});

test("an empty check list means no required checks", (t) => {
  assert.deepEqual(readConfig(checkout(t, VALID.replace("checks:\n  - npm test\n", "checks: []\n"))).checks, []);
});

test("a local check list replaces the committed list whole", (t) => {
  assert.deepEqual(readConfig(checkout(t, VALID, "checks:\n  - make lint\n")).checks, ["make lint"]);
});

test("an unknown key in the local file is refused naming the local file", (t) => {
  refuses(() => readConfig(checkout(t, VALID, "rolse: {}\n")), /loop\.local\.yaml has unknown key "rolse"/);
});

for (const section of ["agents", "roles", "attempts"]) {
  test(`a null ${section} section in the local file is refused naming the local file`, (t) => {
    refuses(() => readConfig(checkout(t, VALID, `${section}: null\n`)), new RegExp(`loop\\.local\\.yaml: "${section}" must be a mapping`));
  });
}

test("an empty local file is refused naming the local file", (t) => {
  refuses(() => readConfig(checkout(t, VALID, "")), /loop\.local\.yaml must be a mapping of settings/);
});

test("an empty committed file is refused even when the local file has every field", (t) => {
  refuses(() => readConfig(checkout(t, "", VALID)), /openspec\/loop\.yaml must be a mapping of settings/);
});

test("a required field may come from the local file alone", (t) => {
  const committed = VALID.replace("  proposalReview: 3\n", "");
  assert.equal(readConfig(checkout(t, committed, "attempts:\n  proposalReview: 1\n")).attempts.proposalReview, 1);
});

// Roles resolve against a PATH holding only the directory the test controls.
// Roles left out are filled by the proposal reviewer's alias.
function resolve(t: After, top: string, agents: Record<string, string[]>, roles: Partial<Config["roles"]> & { proposalReviewer: string }) {
  const path = process.env.PATH;
  process.env.PATH = join(top, "bin");
  t.after(() => (process.env.PATH = path));
  const all = { planReviser: roles.proposalReviewer, implementer: roles.proposalReviewer, implementationReviewer: roles.proposalReviewer, ...roles };
  const config: Config = { defaultBranch: "main", worktrees: ".worktrees", agents, roles: all, attempts: { proposalReview: 1, implementation: 1 }, checks: [], delivery: "local" };
  return () => resolveRoles(top, config);
}

function executableAt(top: string, path: string, mode = 0o755): void {
  mkdirSync(join(top, path, ".."), { recursive: true });
  writeFileSync(join(top, path), "#!/bin/sh\n");
  chmodSync(join(top, path), mode);
}

test("a command on PATH and a repository-relative script resolve to absolute paths", (t) => {
  const top = checkout(t);
  executableAt(top, "bin/loop-codex");
  executableAt(top, "scripts/my-adapter");
  const agents = { gpt: ["loop-codex", "-m", "gpt-5.5"], mine: ["scripts/my-adapter", "--fast"] };
  const gpt = { alias: "gpt", command: [join(top, "bin/loop-codex"), "-m", "gpt-5.5"] };
  const mine = { alias: "mine", command: [join(top, "scripts/my-adapter"), "--fast"] };
  assert.deepEqual(resolve(t, top, agents, { proposalReviewer: "gpt", planReviser: "mine", implementer: "mine" })(), {
    proposalReviewer: gpt,
    planReviser: mine,
    implementer: mine,
    implementationReviewer: gpt,
  });
});

test("one agent may fill both roles, and an unused agent is not resolved", (t) => {
  const top = checkout(t);
  executableAt(top, "bin/loop-claude");
  const agents = { opus: ["loop-claude"], broken: ["no-such-command"] };
  const roles = resolve(t, top, agents, { proposalReviewer: "opus", planReviser: "opus" })();
  assert.deepEqual(roles.proposalReviewer, roles.planReviser);
});

for (const alias of ["gpt", "constructor"]) {
  test(`a role naming the undefined alias ${alias} is refused naming the role and the alias`, (t) => {
    const top = checkout(t);
    refuses(
      resolve(t, top, {}, { proposalReviewer: alias, planReviser: alias }),
      new RegExp(`role proposalReviewer names agent "${alias}", which the configuration does not define`),
    );
  });
}

test("a relative PATH entry is resolved against the current directory", (t) => {
  const top = checkout(t);
  executableAt(top, "tools/loop-codex");
  const path = process.env.PATH;
  const cwd = process.cwd();
  process.env.PATH = "tools";
  process.chdir(top);
  t.after(() => {
    process.env.PATH = path;
    process.chdir(cwd);
  });
  const roles = { proposalReviewer: "gpt", planReviser: "gpt", implementer: "gpt", implementationReviewer: "gpt" };
  const config: Config = { defaultBranch: "main", worktrees: ".worktrees", agents: { gpt: ["loop-codex"] }, roles, attempts: { proposalReview: 1, implementation: 1 }, checks: [], delivery: "local" };
  assert.equal(resolveRoles(top, config).proposalReviewer.command[0], join(top, "tools/loop-codex"));
});

test("an implementer naming an undefined alias is refused naming the role", (t) => {
  const top = checkout(t);
  executableAt(top, "bin/loop-codex");
  refuses(
    resolve(t, top, { gpt: ["loop-codex"] }, { proposalReviewer: "gpt", implementer: "opus" }),
    /role implementer names agent "opus", which the configuration does not define/,
  );
});

test("a missing command is refused naming the role and the alias", (t) => {
  const top = checkout(t);
  refuses(
    resolve(t, top, { gpt: ["loop-codex"] }, { proposalReviewer: "gpt", planReviser: "gpt" }),
    /role proposalReviewer uses agent "gpt", whose command loop-codex is not an executable file on PATH/,
  );
});

test("a non-executable file is refused", (t) => {
  const top = checkout(t);
  executableAt(top, "scripts/my-adapter", 0o644);
  refuses(
    resolve(t, top, { mine: ["scripts/my-adapter"] }, { proposalReviewer: "mine", planReviser: "mine" }),
    /whose command scripts\/my-adapter is not an executable file at .*scripts\/my-adapter/,
  );
});
