import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { parse } from "yaml";
import { Refusal } from "./refusal.js";

export const ROLES = ["proposalReviewer", "planReviser"] as const;
export type Role = (typeof ROLES)[number];

export interface Config {
  defaultBranch: string;
  agents: Record<string, string[]>;
  roles: Record<Role, string>;
  attempts: { proposalReview: number };
}

// An agent a role runs: its alias and its command, the first element resolved to an absolute path.
export interface Agent {
  alias: string;
  command: string[];
}

export const CONFIG_PATH = "openspec/loop.yaml";
export const LOCAL_CONFIG_PATH = "openspec/loop.local.yaml";

const ATTEMPTS = ["proposalReview"] as const;

type Settings = { defaultBranch?: string; agents: Record<string, string[]>; roles: Record<string, string>; attempts: Record<string, number> };

// Reads the committed configuration and, when it exists, the local one, whose entries replace the committed ones.
export function readConfig(top: string): Config {
  const committedPath = join(top, CONFIG_PATH);
  const committedText = readText(committedPath);
  if (committedText === undefined) {
    throw new Refusal(`${committedPath} not found; it must name the default branch, agents, roles and attempts`);
  }
  const committed = parseFile(committedPath, committedText);
  const localPath = join(top, LOCAL_CONFIG_PATH);
  const localText = readText(localPath);
  const local = localText === undefined ? undefined : parseFile(localPath, localText);
  const merged: Settings = {
    defaultBranch: local?.defaultBranch ?? committed.defaultBranch,
    agents: { ...committed.agents, ...local?.agents },
    roles: { ...committed.roles, ...local?.roles },
    attempts: { ...committed.attempts, ...local?.attempts },
  };
  const missing = [
    merged.defaultBranch === undefined ? "defaultBranch" : undefined,
    ...ROLES.filter((role) => merged.roles[role] === undefined).map((role) => `roles.${role}`),
    ...ATTEMPTS.filter((key) => merged.attempts[key] === undefined).map((key) => `attempts.${key}`),
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
    const command = config.agents[alias];
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
  const top = mapping(path, "", doc ?? {});
  unknownKeys(path, "", top, ["defaultBranch", "agents", "roles", "attempts"]);
  const { defaultBranch } = top;
  if (defaultBranch !== undefined && (typeof defaultBranch !== "string" || defaultBranch === "")) {
    throw new Refusal(`${path}: "defaultBranch" must be a non-empty branch name`);
  }
  const agents = mapping(path, "agents", top.agents ?? {});
  for (const [alias, command] of Object.entries(agents)) {
    if (!Array.isArray(command) || command.length === 0 || !command.every((part) => typeof part === "string" && part !== "")) {
      throw new Refusal(`${path}: "agents.${alias}" must be a non-empty list of non-empty strings`);
    }
  }
  const roles = mapping(path, "roles", top.roles ?? {});
  unknownKeys(path, "roles.", roles, ROLES);
  for (const [role, alias] of Object.entries(roles)) {
    if (typeof alias !== "string" || alias === "") throw new Refusal(`${path}: "roles.${role}" must be an agent alias`);
  }
  const attempts = mapping(path, "attempts", top.attempts ?? {});
  unknownKeys(path, "attempts.", attempts, ATTEMPTS);
  for (const [key, value] of Object.entries(attempts)) {
    if (!Number.isInteger(value) || (value as number) < 1) {
      throw new Refusal(`${path}: "attempts.${key}" must be a positive integer`);
    }
  }
  return {
    defaultBranch,
    agents: agents as Record<string, string[]>,
    roles: roles as Record<string, string>,
    attempts: attempts as Record<string, number>,
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
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir === "" || !isAbsolute(dir)) continue;
    const path = join(dir, name);
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
