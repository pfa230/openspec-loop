import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

test("loop prints usage and exits 2", () => {
  const bin = new URL(pkg.bin.loop, root);
  const result = spawnSync(process.execPath, [bin.pathname], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^Usage: loop /);
});
