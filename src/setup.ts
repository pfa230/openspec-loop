import { cpSync, lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { topLevel } from "./git.js";
import { Refusal } from "./refusal.js";

// Existing destination directories must be real directories; missing ones can be created.
function checkDirectory(path: string): void {
  try {
    if (!lstatSync(path).isDirectory()) throw new Refusal(`cannot install skills: ${path} is not a real directory`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

// Installs the executing package's skills in the invoking checkout, without run preparation.
export function setup(cwd = process.cwd()): number {
  const top = topLevel(cwd);
  const source = fileURLToPath(new URL("../../skills/", import.meta.url));
  try {
    const skills = readdirSync(source, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    const tools = [".agents", ".claude"];
    // Check both tools before changing either one's copies.
    for (const tool of tools) {
      checkDirectory(join(top, tool));
      const parent = join(top, tool, "skills");
      checkDirectory(parent);
      for (const skill of skills) checkDirectory(join(parent, skill));
    }
    for (const tool of tools) {
      const parent = join(top, tool, "skills");
      mkdirSync(parent, { recursive: true });
      for (const skill of skills) {
        const destination = join(parent, skill);
        rmSync(destination, { recursive: true, force: true });
        cpSync(join(source, skill), destination, { recursive: true });
        process.stdout.write(`Installed ${destination}\n`);
      }
    }
    return 0;
  } catch (error) {
    if (error instanceof Refusal) throw error;
    process.stderr.write(`loop setup: ${(error as Error).message}\n`);
    return 1;
  }
}
