import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// What the loop passes an adapter: the agent's own arguments, then the prompt, schema and reply paths.
export interface Invocation {
  args: string[];
  prompt: string;
  schemaPath: string;
  schema: string;
  replyPath: string;
}

export function invocation(): Invocation {
  const argv = process.argv.slice(2);
  if (argv.length < 3) fail("expected the prompt, schema and reply paths as the last three arguments");
  const [promptPath, schemaPath, replyPath] = argv.slice(-3);
  return {
    args: argv.slice(0, -3),
    prompt: readFileSync(promptPath, "utf8"),
    schemaPath,
    schema: readFileSync(schemaPath, "utf8"),
    replyPath,
  };
}

// Runs the harness with no input, copying its output to the adapter's own (the step's transcript),
// and returns its stdout. Exits with the harness's status when it fails.
export async function runHarness(command: string, args: string[]): Promise<string> {
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
  if (code !== 0) fail(`${command} ${code === null ? `was killed by ${signal}` : `exited with status ${code}`}`, code ?? 1);
  return Buffer.concat(chunks).toString("utf8");
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
