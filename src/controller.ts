import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Agent, Config, Role } from "./config.js";
import { FIXTURE_NAMES, type Fixture, type FixtureStage } from "./fixture.js";
import { git } from "./git.js";
import { changeDir, planDigest, planFiles } from "./plan.js";
import { ACK_SCHEMA, type Finding, isAck, isReview, REVIEW_SCHEMA, revisionPrompt, reviewPrompt } from "./prompts.js";
import { releaseLock, STAGES, type RunState, type Stage, writeState } from "./state.js";
import { nextStep, readReply, runStep, startWorker, type Step, type StepResult } from "./step.js";

export function progress(message: string): void {
  const time = new Date().toTimeString().slice(0, 8);
  process.stdout.write(`[${time}] ${message}\n`);
}

export const FIXTURE_NOTE = `Stages ${FIXTURE_NAMES} were fixtures and did no real work.`;

export function locations(dir: string, state: RunState): string {
  return `Worktree: ${state.worktree}\nRun directory: ${dir}\nTranscripts: ${join(dir, "transcripts")}\n`;
}

// True when proposal review is complete but the plan no longer matches what it approved.
export function planChanged(state: RunState): boolean {
  return state.stages["proposal-review"] === "complete" && planDigest(state.worktree, state.change) !== state.approvedPlan;
}

export interface Setup {
  config: Config;
  agents: Record<Role, Agent>;
  fixture: Fixture;
  // Replaces the configured attempt budgets for this advancement.
  attempts: number | undefined;
}

interface Verdict {
  verdict: "APPROVE" | "REVISE";
  plan: string;
  findings: Finding[];
}

// How a stage ended when it did not complete: the cause and, when it is not `loop resume`, the recovery.
interface Halt {
  cause: string;
  recovery?: string;
}

const SIGNALS = ["SIGTERM", "SIGINT", "SIGHUP"] as const;
const USER_STOP = "stopped by the user";

// Advances the run from its first incomplete stage until every stage completes or one stops.
// The caller holds the run's lock; advance releases it. Returns the exit status.
export async function advance(dir: string, state: RunState, setup: Setup): Promise<number> {
  let stopping = false;
  let current: Step | undefined;
  const onSignal = () => {
    stopping = true;
    current?.kill();
  };
  const run = { dir, state, setup, stopping: () => stopping, exec };
  async function exec(step: Step): Promise<StepResult> {
    current = step;
    try {
      return await step.result;
    } finally {
      current = undefined;
    }
  }
  for (const signal of SIGNALS) process.on(signal, onSignal);
  try {
    state.stop = null;
    for (;;) {
      if (planChanged(state)) {
        progress("plan changed since its approval; reviewing it again");
        for (const stage of STAGES) state.stages[stage] = "pending";
        writeState(dir, state);
      }
      const stage = STAGES.find((candidate) => state.stages[candidate] !== "complete");
      if (stage === undefined) break;
      if (stopping) return stop(dir, state, stage, { cause: USER_STOP });
      state.current = stage;
      writeState(dir, state);
      let halt: Halt | undefined;
      try {
        halt = stage === "proposal-review" ? await proposalReview(run) : await fixtureStage(run, stage);
      } catch (error) {
        halt = { cause: `execution failure of the loop: ${(error as Error).message}` };
      }
      if (halt) return stop(dir, state, stage, halt);
      state.stages[stage] = "complete";
      state.current = null;
      writeState(dir, state);
      if (stage === "proposal-review") progress(`${stage}: complete`);
      else progress(`${stage}: complete (fixture)`);
    }
    process.stdout.write(`Run ${state.change} completed. ${FIXTURE_NOTE}\n${locations(dir, state)}`);
    return 0;
  } finally {
    for (const signal of SIGNALS) process.off(signal, onSignal);
    releaseLock(dir);
  }
}

interface Run {
  dir: string;
  state: RunState;
  setup: Setup;
  stopping(): boolean;
  exec(step: Step): Promise<StepResult>;
}

async function fixtureStage(run: Run, stage: FixtureStage): Promise<Halt | undefined> {
  progress(`${stage}: started (fixture)`);
  let cause: string | undefined;
  try {
    const transcript = `${nextStep(run.dir, stage)}.log`;
    const { code, signal } = await run.exec(runStep("sh", ["-c", run.setup.fixture[stage]], run.state.worktree, transcript));
    if (run.stopping()) cause = USER_STOP;
    else if (code !== 0) cause = code === null ? `execution failure, signal ${signal}` : `execution failure, exit status ${code}`;
  } catch (error) {
    cause = `execution failure of the loop: ${(error as Error).message}`;
  }
  if (!cause) return undefined;
  progress(`${stage}: ${cause} (fixture)`);
  return { cause: run.stopping() ? cause : `${cause} (fixture)` };
}

// Reviews the plan until it is approved, revising it after each REVISE, within the attempt budget.
// Completing sets approvedPlan; the caller marks the stage complete in the same state write.
async function proposalReview(run: Run): Promise<Halt | undefined> {
  const { state, setup } = run;
  const budget = setup.attempts ?? setup.config.attempts.proposalReview;
  if (state.owedReview) {
    const record = JSON.parse(readFileSync(state.owedReview, "utf8")) as Verdict;
    const halt = await reviserTurn(run, record);
    if (halt) return halt;
    if (record.verdict === "APPROVE") return approve(state, planDigest(state.worktree, state.change));
    state.owedReview = null;
    writeState(run.dir, state);
  }
  for (let review = 1; ; review++) {
    const label = `review ${review} of ${budget}`;
    const plan = planDigest(state.worktree, state.change);
    const base = nextStep(run.dir, "proposal-review");
    const reply = await work(run, label, "proposalReviewer", base, reviewPrompt(state.change, planFiles(state.worktree, state.change)), REVIEW_SCHEMA, isReview);
    if ("cause" in reply) return reply;
    const { findings } = reply.value;
    const blocking = findings.filter((finding) => finding.severity === "blocking").length;
    const record: Verdict = { verdict: blocking > 0 ? "REVISE" : "APPROVE", plan, findings };
    const recordPath = `${base}.verdict.json`;
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    progress(`proposal-review: ${label} ${record.verdict}, ${blocking} blocking, ${findings.length - blocking} minor (${setup.agents.proposalReviewer.alias})`);

    const questions = findings.filter((finding) => finding.question !== null);
    if (questions.length > 0) {
      return {
        cause: `review ${review} needs decisions the plan does not record:\n${questions.map((finding) => `  - ${finding.location}: ${finding.question}`).join("\n")}\nReview: ${recordPath}`,
        recovery: `record the decisions in ${changeDir(state.change)}/design.md in worktree ${state.worktree}, commit them on branch ${state.branch}, then run \`loop resume ${state.change}\``,
      };
    }
    if (findings.length === 0) return approve(state, plan);

    state.owedReview = recordPath;
    writeState(run.dir, state);
    const halt = await reviserTurn(run, record);
    if (halt) return halt;
    if (record.verdict === "APPROVE") return approve(state, planDigest(state.worktree, state.change));
    state.owedReview = null;
    writeState(run.dir, state);
    if (review >= budget) {
      return { cause: `proposal review attempts exhausted (${review} of ${budget}); the last review was REVISE, ${blocking} blocking\nReview: ${recordPath}` };
    }
  }
}

function approve(state: RunState, plan: string): undefined {
  state.approvedPlan = plan;
  state.owedReview = null;
  return undefined;
}

// Has the plan reviser revise the plan after REVISE, or apply the minor fixes after APPROVE, and commits the result.
async function reviserTurn(run: Run, record: Verdict): Promise<Halt | undefined> {
  const { state } = run;
  const fix = record.verdict === "APPROVE";
  const label = fix ? "minor plan fixes" : "plan revision";
  const base = nextStep(run.dir, fix ? "plan-fixes" : "plan-revision");
  const reply = await work(run, label, "planReviser", base, revisionPrompt(state.change, record.findings, fix), ACK_SCHEMA, isAck);
  if ("cause" in reply) return reply;
  const dir = changeDir(state.change);
  git(state.worktree, "add", "--all", "--", dir);
  const alias = run.setup.agents.planReviser.alias;
  if (git(state.worktree, "status", "--porcelain", "--", dir) === "") {
    progress(`proposal-review: ${label} made no changes (${alias})`);
    return undefined;
  }
  const message = fix ? `${state.change}: apply minor plan fixes` : `${state.change}: revise plan`;
  git(state.worktree, "commit", "--quiet", "-m", message, "--", dir);
  progress(`proposal-review: ${label} committed ${git(state.worktree, "rev-parse", "--short=7", "HEAD")} (${alias})`);
  return undefined;
}

// Runs one worker turn of a role and returns its checked reply, or why the run must stop.
async function work<T>(
  run: Run,
  label: string,
  role: Role,
  base: string,
  prompt: string,
  schema: object,
  check: (value: unknown) => value is T,
): Promise<{ value: T } | Halt> {
  const agent = run.setup.agents[role];
  if (run.stopping()) return { cause: USER_STOP };
  progress(`proposal-review: ${label} started (${agent.alias})`);
  let problem: string;
  let files: { transcript: string; reply: string } | undefined;
  try {
    const worker = startWorker(agent.command, run.state.worktree, base, prompt, schema);
    files = worker.files;
    const { code, signal } = await run.exec(worker.step);
    if (run.stopping()) {
      progress(`proposal-review: ${label} ${USER_STOP} (${agent.alias})`);
      return { cause: USER_STOP };
    }
    if (code !== 0) problem = code === null ? `signal ${signal}` : `exit status ${code}`;
    else {
      const reply = readReply(files.reply, check);
      if ("value" in reply) return reply;
      problem = reply.problem;
    }
  } catch (error) {
    problem = (error as Error).message;
  }
  progress(`proposal-review: ${label} execution failure, ${problem} (${agent.alias})`);
  const where = files ? `\nTranscript: ${files.transcript}\nReply: ${files.reply}` : "";
  return { cause: `execution failure of ${role} agent "${agent.alias}": ${problem}${where}` };
}

function stop(dir: string, state: RunState, stage: Stage, halt: Halt): number {
  state.current = null;
  state.stop = { stage, cause: halt.cause, recovery: halt.recovery ?? `loop resume ${state.change}` };
  writeState(dir, state);
  process.stdout.write(
    `Run ${state.change} stopped at ${stage}.\nCause: ${halt.cause}\nRecovery: ${state.stop.recovery}\n${locations(dir, state)}`,
  );
  return 1;
}
