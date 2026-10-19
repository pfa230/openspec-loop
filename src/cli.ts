#!/usr/bin/env node
import { delimiter, dirname, resolve } from "node:path";
import { resume, run, status, step, stop } from "./commands.js";
import { Refusal } from "./refusal.js";
import { finishScope, startScope } from "./scope.js";
import { setup } from "./setup.js";

// Sibling installed commands, such as the adapters, stay findable when a shell launches loop by path
// without its installation's bin directory on PATH. The invoked path is used as is, so a symlinked
// launch appends its own directory rather than the package's, and existing PATH entries keep precedence.
const launchDirectory = dirname(resolve(process.argv[1]!));
process.env.PATH = process.env.PATH === undefined ? launchDirectory : `${process.env.PATH}${delimiter}${launchDirectory}`;

const COMMANDS = { run, step, status, stop, resume };
const USAGE = "Usage: loop <status|stop> <change>\n       loop <run|step> <change> [<proposalReviewer> <planReviser> <implementer> <implementationReviewer>]\n       loop resume <change> [<the four agents>] [--attempts <n>] [--implement] [--review]\n       loop scope <start|finish> <session>\n       loop setup\n";

interface Args {
  name: keyof typeof COMMANDS;
  change: string;
  roles?: string[];
  attempts?: number;
  implement: boolean;
  review: boolean;
}

// Returns the requested command and its arguments, or undefined for malformed syntax.
function parseArgs(argv: string[]): Args | { name: "scope"; action: "start" | "finish"; session: string } | { name: "setup" } | undefined {
  const [name, change, ...extra] = argv;
  if (name === "setup") return argv.length === 1 ? { name } : undefined;
  if (name === "scope") {
    if ((change !== "start" && change !== "finish") || extra.length !== 1) return undefined;
    return { name, action: change, session: extra[0] };
  }
  if (name === undefined || !Object.hasOwn(COMMANDS, name) || change === undefined) return undefined;
  const args: Args = { name: name as keyof typeof COMMANDS, change, implement: false, review: false };
  const options = extra.findIndex((arg) => arg.startsWith("--"));
  const aliases = options === -1 ? extra.length : options;
  if (aliases === 4 && name !== "status" && name !== "stop") args.roles = extra.splice(0, 4);
  else if (aliases !== 0) return undefined;
  if (extra.length > 0 && name !== "resume") return undefined;
  while (extra.length > 0) {
    const option = extra.shift();
    if (option === "--implement" && !args.implement) {
      args.implement = true;
    } else if (option === "--review" && !args.review) {
      args.review = true;
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
  try {
    if (parsed.name === "setup") {
      process.exitCode = setup();
    } else if (parsed.name === "scope") {
      process.exitCode = parsed.action === "start" ? await startScope(parsed.session) : await finishScope(parsed.session);
    } else {
      const { name, change, roles, attempts, implement, review } = parsed;
      process.exitCode = name === "resume" ? await resume(change, roles, attempts, implement, review)
        : name === "run" || name === "step" ? await COMMANDS[name](change, roles)
        : await COMMANDS[name](change);
    }
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stderr.write(`loop: ${error.message}\n`);
    process.exitCode = 2;
  }
}
