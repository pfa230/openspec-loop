import { execFileSync } from "node:child_process";
import { relative, sep } from "node:path";
import { Refusal } from "./refusal.js";

const MINIMUM = [1, 14, 0];

export function checkOpenSpec(): void {
  let output: string;
  try {
    output = execFileSync("openspec", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Refusal(`\`openspec\` was not found on PATH; openspec-loop needs OpenSpec ${MINIMUM.join(".")} or later`);
    }
    throw new Refusal(`\`openspec --version\` failed: ${(error as Error).message}`);
  }
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(output);
  if (!match) {
    throw new Refusal(`could not read a version from \`openspec --version\`: ${output.trim()}`);
  }
  const version = match.slice(1).map(Number);
  for (let i = 0; i < MINIMUM.length; i++) {
    if (version[i] === MINIMUM[i]) continue;
    if (version[i] < MINIMUM[i]) {
      throw new Refusal(`openspec ${match[0]} is older than the minimum ${MINIMUM.join(".")}`);
    }
    return;
  }
}

// What the native apply instructions give the implementer.
export interface ApplyInstructions {
  instruction: string;
  guidance: string[];
  // The change's context files, relative to the worktree.
  contextFiles: string[];
}

// Reads `openspec instructions apply` for a change in its worktree. Throws when the command fails or its output is unusable.
export function applyInstructions(worktree: string, change: string): ApplyInstructions {
  let output: string;
  try {
    output = execFileSync("openspec", ["instructions", "apply", "--change", change, "--json"], {
      cwd: worktree,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(`\`openspec instructions apply --change ${change}\` failed: ${stderr || (error as Error).message}`);
  }
  const unusable = new Error(`\`openspec instructions apply --change ${change}\` printed no usable instructions`);
  let doc: { instruction?: unknown; operationGuidance?: unknown; contextFiles?: unknown };
  try {
    doc = JSON.parse(output);
  } catch {
    throw unusable;
  }
  const { instruction, operationGuidance, contextFiles } = doc ?? {};
  const guidance = operationGuidance ?? [];
  const files = Object.values(contextFiles ?? {}).flat();
  if (
    typeof instruction !== "string" ||
    !Array.isArray(guidance) ||
    !guidance.every((entry) => typeof entry === "string") ||
    contextFiles === null ||
    typeof contextFiles !== "object" ||
    !files.every((file) => typeof file === "string")
  ) {
    throw unusable;
  }
  return { instruction, guidance, contextFiles: files.map((file) => relative(worktree, file).split(sep).join("/")) };
}
