import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { Refusal } from "./refusal.js";
import { STAGES } from "./state.js";

// Fixture stages stand in for stages that later build steps make real. Remove this module with the last one.
export const FIXTURE_STAGES = STAGES.filter((stage) => stage !== "proposal-review");
export type FixtureStage = (typeof FIXTURE_STAGES)[number];
export type Fixture = Record<FixtureStage, string>;
export const FIXTURE_NAMES = `${FIXTURE_STAGES.slice(0, -1).join(", ")} and ${FIXTURE_STAGES.at(-1)}`;

export function loadFixture(): Fixture {
  const path = process.env.LOOP_FIXTURE;
  if (!path) {
    throw new Refusal(
      `stages ${FIXTURE_NAMES} are not implemented yet; set LOOP_FIXTURE to a YAML file mapping each to a fixture command`,
    );
  }
  let doc: unknown;
  try {
    doc = parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Refusal(`cannot read the fixture ${path}: ${(error as Error).message}`);
  }
  const commands = (doc ?? {}) as Record<string, unknown>;
  const missing = FIXTURE_STAGES.filter((stage) => typeof commands[stage] !== "string");
  if (missing.length > 0) {
    throw new Refusal(`the fixture ${path} names no command for ${missing.join(", ")}`);
  }
  return commands as Fixture;
}
