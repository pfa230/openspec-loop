#!/usr/bin/env node
// OpenCode's prompt API decodes the native format; text stays in the transcript.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { inspect } from "node:util";
import { Agent, fetch, type Response } from "undici";
import { counters, fail, invocation, usage, writeReply } from "./common.js";

const { args, prompt, schema, replyPath, usagePath } = invocation();
const selections: Record<string, string> = {};
let auto = false;
let pure: boolean | undefined;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const equal = arg.indexOf("=");
  const option = equal < 0 ? arg : arg.slice(0, equal);
  let value = equal < 0 ? undefined : arg.slice(equal + 1);
  if (["-m", "--model", "--agent", "--variant"].includes(option)) {
    value ??= args[++i];
    if (!value || value.startsWith("-")) fail(`${option} requires a value`);
    selections[option === "-m" ? "model" : option.slice(2)] = value;
  } else if (["--auto", "--pure", "--no-auto", "--no-pure"].includes(option)) {
    if (option.startsWith("--no-")) {
      if (value !== undefined) fail(`unsupported OpenCode argument ${arg}`);
      value = "false";
    } else if (value === undefined && ["true", "false"].includes(args[i + 1])) value = args[++i];
    value ??= "true";
    if (value !== "true" && value !== "false") fail(`${option} requires true or false`);
    if (option.endsWith("auto")) auto = value === "true";
    else pure = value === "true";
  } else fail(`unsupported OpenCode argument ${arg}`);
}
const format = { type: "json_schema", schema: JSON.parse(schema) };
const headers: Record<string, string> = { "content-type": "application/json" };
if (process.env.OPENCODE_SERVER_PASSWORD) {
  headers.authorization = `Basic ${Buffer.from(`${process.env.OPENCODE_SERVER_USERNAME ?? "opencode"}:${process.env.OPENCODE_SERVER_PASSWORD}`).toString("base64")}`;
}

interface StepPart { id: string; sessionID: string; type: string; tokens?: unknown; cost?: unknown }
interface Event {
  type: string;
  properties: {
    sessionID?: string;
    info?: { id: string; parentID?: string };
    part?: StepPart;
    status?: { type: string };
    id?: string;
    error?: unknown;
  };
}
interface PromptResponse { info: { structured?: unknown; error?: unknown } }

const controller = new AbortController();
const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
const steps = new Map<string, StepPart>();
let failure: { message: string; status: number } | undefined;
let closing = false;
function stop(error: string | Error, status = 1): void {
  const reason = typeof error === "string" ? new Error(error) : error;
  failure ??= { message: reason.message, status };
  controller.abort(reason);
}
const failed = new Promise<never>((_, reject) => {
  controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
});
// Abort can precede the readiness race, or occur during final cleanup.
void failed.catch(() => {});
const child = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", "0", "--mdns=false", ...(pure === undefined ? [] : [`--pure=${pure}`])], { stdio: ["ignore", "pipe", "inherit"] });
child.once("error", (error) => stop(new Error(`cannot run opencode: ${error.message}`, { cause: error })));
const exited = new Promise<void>((resolve) => {
  child.once("exit", (code, signal) => {
    // An HTTP disconnect can precede the exit notification. Cleanup must not
    // hide an actual nonzero exit; our normal termination is a signal or exit 0.
    if (!closing || (code !== null && code !== 0)) {
      failure = { message: `opencode ${code === null ? `was killed by ${signal}` : `exited with status ${code}`}`, status: code || 1 };
      controller.abort(new Error(failure.message));
    }
  });
  child.once("close", () => resolve());
});
const interrupt = (signal: NodeJS.Signals) => stop(`opencode worker interrupted by ${signal}`, signal === "SIGINT" ? 130 : 143);
const onInt = () => interrupt("SIGINT");
const onTerm = () => interrupt("SIGTERM");
process.on("SIGINT", onInt);
process.on("SIGTERM", onTerm);
const startupTimer = setTimeout(() => stop("opencode server did not become ready within 5000ms"), 5000);
const ready = new Promise<string>((resolve) => {
  let pending = "";
  child.stdout.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    pending += chunk.toString("utf8");
    const lines = pending.split("\n");
    pending = lines.pop()!;
    for (const line of lines) {
      const match = /^opencode server listening on (\S+)/.exec(line);
      if (match) {
        clearTimeout(startupTimer);
        resolve(match[1]);
      }
    }
  });
});
let base: string;
async function request(path: string, body?: unknown): Promise<Response> {
  const url = new URL(path, base);
  url.searchParams.set("directory", process.cwd());
  const method = body === undefined ? "GET" : "POST";
  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, dispatcher });
  } catch (error) {
    throw new Error(`opencode API ${method} ${path} request failed`, { cause: error });
  }
  if (!response.ok) {
    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      throw new Error(`opencode API ${method} ${path} response read failed (HTTP ${response.status})`, { cause: error });
    }
    process.stdout.write(`${JSON.stringify({ type: "api.error", path, status: response.status, error: text })}\n`);
    throw new Error(`opencode API ${method} ${path} failed with HTTP ${response.status}`);
  }
  return response;
}

async function json(path: string, body?: unknown): Promise<unknown> {
  const response = await request(path, body);
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`opencode API ${body === undefined ? "GET" : "POST"} ${path} response read failed`, { cause: error });
  }
}

async function events(response: Response, sessionID: string): Promise<void> {
  if (!response.body) throw new Error("opencode API GET /event response read failed: event stream has no body");
  const sessions = new Set([sessionID]);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { value, done } = await reader.read().catch(error => {
        throw new Error("opencode API GET /event response read failed", { cause: error });
      });
      if (done) throw new Error("opencode API GET /event response read failed: event stream closed before the prompt completed");
      pending += decoder.decode(value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        const block = pending.slice(0, boundary.index);
        pending = pending.slice(boundary.index + boundary[0].length);
        const data = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).replace(/^ /, "")).join("\n");
        if (!data) continue;
        let event: Event;
        try {
          event = JSON.parse(data) as Event;
        } catch (error) {
          throw new Error("opencode API GET /event response read failed", { cause: error });
        }
        process.stdout.write(`${JSON.stringify(event)}\n`);
        const props = event.properties;
        if (event.type === "session.created" && props.info?.parentID && sessions.has(props.info.parentID)) sessions.add(props.info.id);
        if (event.type === "permission.asked" && props.sessionID && sessions.has(props.sessionID)) {
          await request(`/permission/${props.id}/reply`, { reply: auto ? "once" : "reject" });
        }
        if (event.type === "message.part.updated" && props.part?.sessionID === sessionID && props.part.type === "step-finish") steps.set(props.part.id, props.part);
        if (event.type === "session.error" && props.sessionID === sessionID) throw new Error(`opencode session error: ${JSON.stringify(props.error)}`);
        if (event.type === "session.status" && props.sessionID === sessionID && props.status?.type === "idle") return;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

let response: PromptResponse | undefined;
let streamed: Promise<void> | undefined;
try {
  base = await Promise.race([ready, failed]);
  const session = await json("/session", { permission: ["question", "plan_enter", "plan_exit"].map(permission => ({ permission, pattern: "*", action: "deny" })) }) as { id: string };
  streamed = events(await request("/event"), session.id);
  const model = selections.model?.split("/");
  const result = (async () => {
    const returned = await json(`/session/${session.id}/message`, {
      format,
      ...(model && { model: { providerID: model[0], modelID: model.slice(1).join("/") } }),
      ...(selections.agent && { agent: selections.agent }),
      ...(selections.variant && { variant: selections.variant }),
      parts: [{ type: "text", text: `${prompt}\nAfter completing the work and any required presentation, finish by calling OpenCode's StructuredOutput tool with the reply matching the supplied schema. Text is kept in the transcript and cannot serve as the reply.` }],
    }) as PromptResponse;
    process.stdout.write(`${JSON.stringify({ type: "prompt.response", response: returned })}\n`);
    return returned;
  })();
  [response] = await Promise.all([result, streamed]);
  if (response.info.error) throw new Error(`opencode response error: ${JSON.stringify(response.info.error)}`);
} catch (error) {
  process.stderr.write(`${inspect(error, { depth: null })}\n`);
  stop(error instanceof Error ? error : String(error));
} finally {
  clearTimeout(startupTimer);
  closing = true;
  controller.abort();
  child.kill("SIGTERM");
  const killTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
  await exited;
  clearTimeout(killTimer);
  await streamed?.catch(() => {});
  process.off("SIGINT", onInt);
  process.off("SIGTERM", onTerm);
  const tokens: Record<string, number> = Object.create(null);
  let cost: number | undefined;
  // Preserve invalid quantities for the worker's usage-file validation.
  const add = (total: number | undefined, count: number): number => {
    if (total !== undefined && (!Number.isFinite(total) || total < 0)) return total;
    if (!Number.isFinite(count) || count < 0) return count;
    return (total ?? 0) + count;
  };
  for (const part of steps.values()) {
    for (const [name, count] of Object.entries(counters(part.tokens))) tokens[name] = add(tokens[name], count);
    if (typeof part.cost === "number") cost = add(cost, part.cost);
  }
  const reported = usage(tokens, cost);
  if (reported) writeFileSync(usagePath, `${JSON.stringify(reported)}\n`);
}
if (failure) fail(failure.message, failure.status);
if (response?.info.structured === undefined) fail("opencode gave no successful native structured output");
writeReply(replyPath, response.info.structured);
