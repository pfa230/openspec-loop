#!/usr/bin/env node
import { resume, run, status, step, stop } from "./commands.js";
import { Refusal } from "./refusal.js";

const COMMANDS = { run, step, status, stop, resume };
const USAGE = "Usage: loop <run|step|status|stop> <change>\n       loop resume <change> [--attempts <n>] [--implement]\n";

interface Args {
  name: keyof typeof COMMANDS;
  change: string;
  attempts?: number;
  implement: boolean;
}

// Returns the command, the change and resume's options, or undefined for a malformed command line.
function parseArgs(argv: string[]): Args | undefined {
  const [name, change, ...extra] = argv;
  if (name === undefined || !Object.hasOwn(COMMANDS, name) || change === undefined) return undefined;
  const args: Args = { name: name as keyof typeof COMMANDS, change, implement: false };
  if (extra.length > 0 && name !== "resume") return undefined;
  while (extra.length > 0) {
    const option = extra.shift();
    if (option === "--implement" && !args.implement) {
      args.implement = true;
    } else if (option === "--attempts" && args.attempts === undefined) {
      const value = extra.shift() ?? "";
      const attempts = Number(value);
      if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(attempts)) return undefined;
      args.attempts = attempts;
    } else {
      return undefined;
    }
  }
  return args;
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed === undefined) {
  process.stderr.write(USAGE);
  process.exitCode = 2;
} else {
  const { name, change, attempts, implement } = parsed;
  try {
    process.exitCode = name === "resume" ? await resume(change, attempts, implement) : await COMMANDS[name](change);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stderr.write(`loop: ${error.message}\n`);
    process.exitCode = 2;
  }
}
