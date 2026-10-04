import { execFileSync } from "node:child_process";
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
