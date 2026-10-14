import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import type { Usage } from "../step.js";

// What the loop passes an adapter: the agent's own arguments, then the prompt, schema, reply and usage paths.
export interface Invocation {
  args: string[];
  prompt: string;
  schemaPath: string;
  schema: string;
  replyPath: string;
  usagePath: string;
}

export function invocation(): Invocation {
  const argv = process.argv.slice(2);
  if (argv.length < 4) fail("expected the prompt, schema, reply and usage paths as the last four arguments");
  const [promptPath, schemaPath, replyPath, usagePath] = argv.slice(-4);
  return {
    args: argv.slice(0, -4),
    prompt: readFileSync(promptPath, "utf8"),
    schemaPath,
    schema: readFileSync(schemaPath, "utf8"),
    replyPath,
    usagePath,
  };
}

// Runs the harness with no input, copying its output to the adapter's own (the step's transcript),
// and returns its stdout. Writes the usage that usageOf finds in the stdout before judging the exit,
// so a failed turn keeps the usage it reported. Exits with the harness's status when it fails.
export async function runHarness(command: string, args: string[], usagePath: string, usageOf: (stdout: string) => Usage | undefined): Promise<string> {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"] });
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
    process.stdout.write(chunk);
  });
  const { code, signal } = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  }).catch((error: Error) => fail(`cannot run ${command}: ${error.message}`));
  const stdout = Buffer.concat(chunks).toString("utf8");
  const usage = usageOf(stdout);
  if (usage) writeFileSync(usagePath, `${JSON.stringify(usage)}\n`);
  if (code !== 0) fail(`${command} ${code === null ? `was killed by ${signal}` : `exited with status ${code}`}`, code ?? 1);
  return stdout;
}

// The sum of the native fields the harness reported, or undefined when it reported none of them. A negative or
// nonfinite field makes the sum NaN, which the usage file holds as null, so worker validation rejects it.
export function total(...fields: unknown[]): number | undefined {
  const reported = fields.filter((field): field is number => typeof field === "number");
  if (reported.length === 0) return undefined;
  return reported.every((field) => Number.isFinite(field) && field >= 0) ? reported.reduce((sum, field) => sum + field, 0) : NaN;
}

// The usage to write, or undefined when the harness reported none of it.
export function usage(inputTokens: number | undefined, outputTokens: number | undefined, costUsd: number | undefined): Usage | undefined {
  return inputTokens === undefined && outputTokens === undefined && costUsd === undefined ? undefined : { inputTokens, outputTokens, costUsd };
}

export function writeReply(path: string, answer: unknown): void {
  if (answer === null || typeof answer !== "object" || Array.isArray(answer)) fail("the harness gave no JSON object as its answer");
  writeFileSync(path, `${JSON.stringify(answer)}\n`);
}

// The JSON values of the lines of a JSON-lines stream that parse; other lines are ignored.
export function jsonLines(text: string): unknown[] {
  return text.split("\n").flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

export function fail(message: string, status = 1): never {
  process.stderr.write(`${process.argv[1]?.split("/").at(-1) ?? "adapter"}: ${message}\n`);
  process.exit(status);
}
