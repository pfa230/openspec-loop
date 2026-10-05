#!/usr/bin/env node
import { resume, run, status, stop } from "./commands.js";
import { Refusal } from "./refusal.js";

const COMMANDS = { run, status, stop, resume };
const USAGE = "Usage: loop <run|status|stop> <change>\n       loop resume <change> [--attempts <n>]\n";

// Returns the command, the change and the attempt override, or undefined for a malformed command line.
function parseArgs(argv: string[]): [keyof typeof COMMANDS, string, number | undefined] | undefined {
  const [name, change, ...extra] = argv;
  if (name === undefined || !Object.hasOwn(COMMANDS, name) || change === undefined) return undefined;
  if (extra.length === 0) return [name as keyof typeof COMMANDS, change, undefined];
  const attempts = Number(extra[1]);
  if (name !== "resume" || extra.length !== 2 || extra[0] !== "--attempts" || !/^[1-9]\d*$/.test(extra[1]) || !Number.isSafeInteger(attempts)) {
    return undefined;
  }
  return [name, change, attempts];
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed === undefined) {
  process.stderr.write(USAGE);
  process.exitCode = 2;
} else {
  const [name, change, attempts] = parsed;
  try {
    process.exitCode = name === "resume" ? await resume(change, attempts) : await COMMANDS[name](change);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stderr.write(`loop: ${error.message}\n`);
    process.exitCode = 2;
  }
}
