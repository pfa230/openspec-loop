#!/usr/bin/env node
import { resume, run, status, stop } from "./commands.js";
import { Refusal } from "./refusal.js";

const COMMANDS = { run, status, stop, resume };
const USAGE = "Usage: loop <run|status|stop|resume> <change>\n";

const [name, change, ...extra] = process.argv.slice(2);
if (name === undefined || !Object.hasOwn(COMMANDS, name) || change === undefined || extra.length > 0) {
  process.stderr.write(USAGE);
  process.exitCode = 2;
} else {
  try {
    process.exitCode = await COMMANDS[name as keyof typeof COMMANDS](change);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stderr.write(`loop: ${error.message}\n`);
    process.exitCode = 2;
  }
}
