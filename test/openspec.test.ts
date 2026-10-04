import assert from "node:assert/strict";
import { test } from "node:test";
import { makeRepo, runLoop } from "./helpers.js";

for (const command of ["run", "resume"]) {
  test(`${command} refuses openspec 1.9.0 and names the minimum`, (t) => {
    const repo = makeRepo(t, { openspec: "1.9.0" });
    const result = runLoop(repo, [command, "add-thing"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /openspec 1\.9\.0 is older than the minimum 1\.14\.0/);
  });

  test(`${command} refuses when openspec is missing`, (t) => {
    const repo = makeRepo(t, { openspec: null });
    const result = runLoop(repo, [command, "add-thing"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /`openspec` was not found on PATH/);
  });
}

for (const version of ["1.14.0", "2.0.0"]) {
  test(`run accepts openspec ${version}`, (t) => {
    const repo = makeRepo(t, { openspec: version });
    const result = runLoop(repo, ["run", "add-thing"]);
    assert.equal(result.status, 0, result.stderr);
  });
}
