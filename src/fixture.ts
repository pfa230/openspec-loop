import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { Refusal } from "./refusal.js";
import { STAGES, type Stage } from "./state.js";

// Fixture stages stand in for stages that later build steps make real. Remove this module with the last one.
export type Fixture = Record<Stage, string>;

export function loadFixture(): Fixture {
  const path = process.env.LOOP_FIXTURE;
  if (!path) {
    throw new Refusal("no stage is implemented yet; set LOOP_FIXTURE to a YAML file mapping each stage to a fixture command");
  }
  let doc: unknown;
  try {
    doc = parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Refusal(`cannot read the fixture ${path}: ${(error as Error).message}`);
  }
  const commands = (doc ?? {}) as Record<string, unknown>;
  const missing = STAGES.filter((stage) => typeof commands[stage] !== "string");
  if (missing.length > 0) {
    throw new Refusal(`the fixture ${path} names no command for ${missing.join(", ")}`);
  }
  return commands as Fixture;
}
