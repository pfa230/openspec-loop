import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readConfig } from "../src/config.js";
import { Refusal } from "../src/refusal.js";

function checkout(t: { after: (fn: () => void) => void }, yaml?: string): string {
  const top = mkdtempSync(join(tmpdir(), "loop-config-"));
  t.after(() => rmSync(top, { recursive: true, force: true }));
  if (yaml !== undefined) {
    mkdirSync(join(top, "openspec"));
    writeFileSync(join(top, "openspec/loop.yaml"), yaml);
  }
  return top;
}

function refuses(top: string, message: RegExp): void {
  assert.throws(() => readConfig(top), (error: unknown) => error instanceof Refusal && message.test(error.message));
}

test("valid configuration returns the default branch", (t) => {
  assert.deepEqual(readConfig(checkout(t, "defaultBranch: trunk\n")), { defaultBranch: "trunk" });
});

test("missing file is refused", (t) => {
  refuses(checkout(t), /openspec\/loop\.yaml not found/);
});

test("unparseable YAML is refused", (t) => {
  refuses(checkout(t, "defaultBranch: [main\n"), /is not valid YAML/);
});

test("a non-mapping document is refused", (t) => {
  refuses(checkout(t, "- main\n"), /must be a mapping/);
});

test("a missing field is refused", (t) => {
  refuses(checkout(t, "{}\n"), /missing "defaultBranch"/);
});

test("an unknown key is refused by name", (t) => {
  refuses(checkout(t, "defaultBranch: main\ndefualtBranch: main\n"), /unknown key "defualtBranch"/);
});

test("an empty default branch is refused", (t) => {
  refuses(checkout(t, 'defaultBranch: ""\n'), /must be a non-empty branch name/);
});

test("a non-string default branch is refused", (t) => {
  refuses(checkout(t, "defaultBranch: 3\n"), /must be a non-empty branch name/);
});
