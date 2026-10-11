import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { parse } from "yaml";
import { primaryCheckout } from "./git.js";
import { Refusal } from "./refusal.js";

export const ROLES = ["proposalReviewer", "planReviser", "implementer", "implementationReviewer"] as const;
export type Role = (typeof ROLES)[number];

export const DELIVERIES = ["local", "pr", "merge"] as const;
export type Delivery = (typeof DELIVERIES)[number];

export interface Config {
  defaultBranch: string;
  worktrees: string;
  agents: Record<string, string[]>;
  roles: Record<Role, string>;
  attempts: { proposalReview: number; implementation: number };
  // The required checks: shell commands run in the run's worktree. Empty means none.
  checks: string[];
  delivery: Delivery;
}

// An agent a role runs: its alias and its command, the first element resolved to an absolute path.
export interface Agent {
  alias: string;
  command: string[];
}

export const CONFIG_PATH = "openspec/loop.yaml";
export const LOCAL_CONFIG_PATH = "openspec/loop.local.yaml";

const ATTEMPTS = ["proposalReview", "implementation"] as const;

type Settings = {
  defaultBranch?: string;
  worktrees?: string;
  agents: Record<string, string[]>;
  roles: Record<string, string>;
  attempts: Record<string, number>;
  checks?: string[];
  delivery?: Delivery;
};

// Invoking committed settings, primary local overrides, then distinct invoking local overrides.
export function readConfig(top: string): Config {
  const committedPath = join(top, CONFIG_PATH);
  const committedText = readText(committedPath);
  if (committedText === undefined) {
    throw new Refusal(`${committedPath} not found; it must name the default branch, the worktrees directory, agents, roles, attempts, checks and delivery`);
  }
  let merged = parseFile(committedPath, committedText);
  const primary = primaryCheckout(top);
  for (const checkout of primary === null || primary === top ? [top] : [primary, top]) {
    const localPath = join(checkout, LOCAL_CONFIG_PATH);
    const localText = readText(localPath);
    if (localText === undefined) continue;
    const local = parseFile(localPath, localText);
    merged = {
      defaultBranch: local.defaultBranch ?? merged.defaultBranch,
      worktrees: local.worktrees ?? merged.worktrees,
      agents: { ...merged.agents, ...local.agents },
      roles: { ...merged.roles, ...local.roles },
      attempts: { ...merged.attempts, ...local.attempts },
      checks: local.checks ?? merged.checks,
      delivery: local.delivery ?? merged.delivery,
    };
  }
  const missing = [
    merged.defaultBranch === undefined ? "defaultBranch" : undefined,
    merged.worktrees === undefined ? "worktrees" : undefined,
    ...ROLES.filter((role) => merged.roles[role] === undefined).map((role) => `roles.${role}`),
    ...ATTEMPTS.filter((key) => merged.attempts[key] === undefined).map((key) => `attempts.${key}`),
    merged.checks === undefined ? "checks" : undefined,
    merged.delivery === undefined ? "delivery" : undefined,
  ].filter((field) => field !== undefined);
  if (missing.length > 0) {
    throw new Refusal(`${committedPath} is missing ${missing.map((field) => `"${field}"`).join(", ")}`);
  }
  return merged as Config;
}

// Resolves the agent of each role, refusing an undefined alias or a command that cannot be run.
export function resolveRoles(top: string, config: Config): Record<Role, Agent> {
  const agents = {} as Record<Role, Agent>;
  for (const role of ROLES) {
    const alias = config.roles[role];
    const command = Object.hasOwn(config.agents, alias) ? config.agents[alias] : undefined;
    if (command === undefined) {
      throw new Refusal(`role ${role} names agent "${alias}", which the configuration does not define`);
    }
    const [name, ...args] = command;
    const path = name.includes("/") ? resolve(top, name) : onPath(name);
    if (path === undefined || !executable(path)) {
      const where = name.includes("/") ? `at ${path}` : "on PATH";
      throw new Refusal(`role ${role} uses agent "${alias}", whose command ${name} is not an executable file ${where}`);
    }
    agents[role] = { alias, command: [path, ...args] };
  }
  return agents;
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Refusal(`cannot read ${path}: ${(error as Error).message}`);
  }
}

// Checks one file's structure and types; required fields are checked after merging.
function parseFile(path: string, text: string): Settings {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (error) {
    throw new Refusal(`${path} is not valid YAML: ${(error as Error).message}`);
  }
  const top = mapping(path, "", doc);
  unknownKeys(path, "", top, ["defaultBranch", "worktrees", "agents", "roles", "attempts", "checks", "delivery"]);
  const { defaultBranch } = top;
  if (defaultBranch !== undefined && (typeof defaultBranch !== "string" || defaultBranch === "")) {
    throw new Refusal(`${path}: "defaultBranch" must be a non-empty branch name`);
  }
  const { worktrees } = top;
  if (worktrees !== undefined && (typeof worktrees !== "string" || worktrees === "")) {
    throw new Refusal(`${path}: "worktrees" must be a non-empty path`);
  }
  const agents = mapping(path, "agents", top.agents === undefined ? {} : top.agents);
  for (const [alias, command] of Object.entries(agents)) {
    if (!Array.isArray(command) || command.length === 0 || !command.every((part) => typeof part === "string" && part !== "")) {
      throw new Refusal(`${path}: "agents.${alias}" must be a non-empty list of non-empty strings`);
    }
  }
  const roles = mapping(path, "roles", top.roles === undefined ? {} : top.roles);
  unknownKeys(path, "roles.", roles, ROLES);
  for (const [role, alias] of Object.entries(roles)) {
    if (typeof alias !== "string" || alias === "") throw new Refusal(`${path}: "roles.${role}" must be an agent alias`);
  }
  const attempts = mapping(path, "attempts", top.attempts === undefined ? {} : top.attempts);
  unknownKeys(path, "attempts.", attempts, ATTEMPTS);
  for (const [key, value] of Object.entries(attempts)) {
    if (!Number.isInteger(value) || (value as number) < 1) {
      throw new Refusal(`${path}: "attempts.${key}" must be a positive integer`);
    }
  }
  const { checks } = top;
  if (checks !== undefined && (!Array.isArray(checks) || !checks.every((check) => typeof check === "string" && check !== ""))) {
    throw new Refusal(`${path}: "checks" must be a list of non-empty commands`);
  }
  const { delivery } = top;
  if (delivery !== undefined && !DELIVERIES.includes(delivery as Delivery)) {
    throw new Refusal(`${path}: "delivery" must be one of ${DELIVERIES.join(", ")}`);
  }
  return {
    defaultBranch,
    worktrees,
    agents: agents as Record<string, string[]>,
    roles: roles as Record<string, string>,
    attempts: attempts as Record<string, number>,
    checks: checks as string[] | undefined,
    delivery: delivery as Delivery | undefined,
  };
}

function mapping(path: string, field: string, value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Refusal(field === "" ? `${path} must be a mapping of settings` : `${path}: "${field}" must be a mapping`);
  }
  return value as Record<string, unknown>;
}

function unknownKeys(path: string, prefix: string, value: Record<string, unknown>, known: readonly string[]): void {
  const unknown = Object.keys(value).filter((key) => !known.includes(key));
  if (unknown.length > 0) {
    throw new Refusal(`${path} has unknown key ${unknown.map((key) => `"${prefix}${key}"`).join(", ")}`);
  }
}

function onPath(name: string): string | undefined {
  // As a shell does: relative entries, and an empty one, are relative to the current directory.
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const path = resolve(dir, name);
    if (executable(path)) return path;
  }
  return undefined;
}

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
