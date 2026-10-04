import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { Refusal } from "./refusal.js";

export interface Config {
  defaultBranch: string;
}

export const CONFIG_PATH = "openspec/loop.yaml";

export function readConfig(top: string): Config {
  const path = join(top, CONFIG_PATH);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Refusal(`${path} not found; it must name the default branch, for example "defaultBranch: main"`);
  }
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (error) {
    throw new Refusal(`${path} is not valid YAML: ${(error as Error).message}`);
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Refusal(`${path} must be a mapping of settings`);
  }
  const unknown = Object.keys(doc).filter((key) => key !== "defaultBranch");
  if (unknown.length > 0) {
    throw new Refusal(`${path} has unknown key ${unknown.map((key) => `"${key}"`).join(", ")}`);
  }
  const { defaultBranch } = doc as Record<string, unknown>;
  if (defaultBranch === undefined) {
    throw new Refusal(`${path} is missing "defaultBranch"`);
  }
  if (typeof defaultBranch !== "string" || defaultBranch === "") {
    throw new Refusal(`${path}: "defaultBranch" must be a non-empty branch name`);
  }
  return { defaultBranch };
}
