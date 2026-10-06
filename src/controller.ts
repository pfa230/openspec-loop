import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Agent, Config, Role } from "./config.js";
import { FIXTURE_NAMES, FIXTURE_STAGES, type Fixture, type FixtureStage } from "./fixture.js";
import { type Base, git } from "./git.js";
import { applyInstructions } from "./openspec.js";
import { changeDir, planDigest, planFiles } from "./plan.js";
import {
  ACK_SCHEMA,
  type Finding,
  IMPLEMENTATION_SCHEMA,
  implementationReviewPrompt,
  implementerPrompt,
  isAck,
  isImplementation,
  isReview,
  REVIEW_SCHEMA,
  revisionPrompt,
  reviewPrompt,
} from "./prompts.js";
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

// Makes proposal review and every later stage incomplete. Findings owed to the implementer predate the plan
// approved next, so they are dropped: implementation after reapproval starts with a full round.
function reopenPlan(state: RunState): void {
  for (const stage of STAGES) state.stages[stage] = "pending";
  state.owedFindings = null;
}

export interface Setup {
  config: Config;
  agents: Record<Role, Agent>;
  fixture: Fixture;
  base: Base;
  // Replaces the configured attempt budgets for this advancement.
  attempts: number | undefined;
}

interface Verdict {
  verdict: "APPROVE" | "REVISE";
  findings: Finding[];
}

// A record of findings the implementer must address: an implementation review's verdict, or failed checks without one.
interface Findings {
  verdict?: "APPROVE" | "REVISE";
  findings: Finding[];
}

// How a stage ended when it did not complete: the cause and, when it is not `loop resume`, the recovery.
interface Halt {
  cause: string;
  recovery?: string;
}

const SIGNALS = ["SIGTERM", "SIGINT", "SIGHUP"] as const;
const USER_STOP = "stopped by the user";
// The failed checks of one round share this many characters of output tail, so a prompt carrying them
// stays below Linux's 128 KiB limit on one command-line argument even at four UTF-8 bytes per character.
const CHECK_OUTPUT = 20_000;
// A stage outcome that hands the run back to proposal review instead of completing or stopping.
const REPLAN = "replan";

// Advances the run from its first incomplete stage until every stage completes or one stops.
// The caller holds the run's lock; advance releases it. Returns the exit status.
export async function advance(dir: string, state: RunState, setup: Setup): Promise<number> {
  let stopping = false;
  let current: Step | undefined;
  const onSignal = () => {
    stopping = true;
    current?.kill();
  };
  const run: Run = { dir, state, setup, reviews: 0, rounds: 0, stopping: () => stopping, exec };
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
    writeState(dir, state);
    for (;;) {
      const stage = STAGES.find((candidate) => state.stages[candidate] !== "complete");
      if (stage === undefined) break;
      if (stopping) return stop(dir, state, stage, { cause: USER_STOP });
      state.current = stage;
      writeState(dir, state);
      let outcome: Halt | typeof REPLAN | undefined;
      try {
        if (stage === "proposal-review") outcome = await proposalReview(run);
        else if (stage === "implementation") outcome = await implementation(run);
        else if (stage === "archive") outcome = await archive(run);
        else outcome = await fixtureStage(run, stage);
      } catch (error) {
        outcome = { cause: `execution failure of the loop: ${(error as Error).message}` };
      }
      if (outcome === REPLAN) continue;
      if (outcome) return stop(dir, state, stage, outcome);
      state.stages[stage] = "complete";
      state.current = null;
      writeState(dir, state);
      progress(`${stage}: complete${FIXTURE_STAGES.includes(stage as FixtureStage) ? " (fixture)" : ""}`);
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
  // Proposal reviews this advancement has run; the budget spans every return to proposal review.
  reviews: number;
  // Implementation attempts this advancement has run; likewise across every return to implementation.
  rounds: number;
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

// Archives the change with native OpenSpec, which validates it and applies its spec deltas, and commits the result.
async function archive(run: Run): Promise<Halt | undefined> {
  const { state } = run;
  progress("archive: started");
  const transcript = `${nextStep(run.dir, "archive")}.log`;
  const { code, signal } = await run.exec(runStep("openspec", ["archive", state.change, "--yes"], state.worktree, transcript));
  if (run.stopping()) {
    progress(`archive: ${USER_STOP}`);
    return { cause: USER_STOP };
  }
  if (code !== 0) {
    const outcome = code === null ? `signal ${signal}` : `exit status ${code}`;
    progress(`archive: openspec archive failed, ${outcome}`);
    return {
      cause: `\`openspec archive ${state.change}\` failed with ${outcome}\nTranscript: ${transcript}`,
      recovery: `fix the change in worktree ${state.worktree}, commit it on branch ${state.branch}, then run \`loop resume ${state.change}\``,
    };
  }
  git(state.worktree, "add", "--all");
  git(state.worktree, "commit", "--quiet", "-m", `${state.change}: archive`);
  progress(`archive: committed ${git(state.worktree, "rev-parse", "--short=7", "HEAD")}`);
  return undefined;
}

// Reviews the plan until it is approved, revising it after each REVISE, within the attempt budget.
// Completing clears owedReview; the caller marks the stage complete in the same state write.
async function proposalReview(run: Run): Promise<Halt | undefined> {
  const { state, setup } = run;
  const budget = setup.attempts ?? setup.config.attempts.proposalReview;
  if (state.owedReview) {
    const record = JSON.parse(readFileSync(state.owedReview, "utf8")) as Verdict;
    const halt = await reviserTurn(run, record);
    if (halt) return halt;
    state.owedReview = null;
    if (record.verdict === "APPROVE") return undefined;
    writeState(run.dir, state);
  }
  let last = "";
  for (;;) {
    if (run.reviews >= budget) return { cause: `proposal review attempts exhausted (${run.reviews} of ${budget})${last}` };
    const review = ++run.reviews;
    const label = `review ${review} of ${budget}`;
    const base = nextStep(run.dir, "proposal-review");
    const reply = await work(run, "proposal-review", label, "proposalReviewer", base, reviewPrompt(state.change, planFiles(state.worktree, state.change)), REVIEW_SCHEMA, isReview);
    if ("cause" in reply) return reply;
    const { findings } = reply.value;
    const blocking = findings.filter((finding) => finding.severity === "blocking").length;
    const record: Verdict = { verdict: blocking > 0 ? "REVISE" : "APPROVE", findings };
    const recordPath = `${base}.verdict.json`;
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    progress(`proposal-review: ${label} ${record.verdict}, ${blocking} blocking, ${findings.length - blocking} minor (${setup.agents.proposalReviewer.alias})`);

    const questions = decisionStop(state, `review ${review}`, findings, recordPath);
    if (questions) return questions;
    if (findings.length === 0) return undefined;

    state.owedReview = recordPath;
    writeState(run.dir, state);
    const halt = await reviserTurn(run, record);
    if (halt) return halt;
    state.owedReview = null;
    if (record.verdict === "APPROVE") return undefined;
    writeState(run.dir, state);
    last = `; the last review was REVISE, ${blocking} blocking\nReview: ${recordPath}`;
  }
}

// The stop for findings that need decisions the plan does not record, or undefined when none do.
function decisionStop(state: RunState, review: string, findings: Finding[], recordPath: string): Halt | undefined {
  const questions = findings.filter((finding) => finding.question !== null);
  if (questions.length === 0) return undefined;
  return {
    cause: `${review} needs decisions the plan does not record:\n${questions.map((finding) => `  - ${finding.location}: ${finding.question}`).join("\n")}\nReview: ${recordPath}`,
    recovery: `record the decisions in ${changeDir(state.change)}/design.md in worktree ${state.worktree}, commit them on branch ${state.branch}, then run \`loop resume ${state.change}\``,
  };
}

// Has the plan reviser revise the plan after REVISE, or apply the minor fixes after APPROVE, and commits the result.
async function reviserTurn(run: Run, record: Verdict): Promise<Halt | undefined> {
  const { state } = run;
  const fix = record.verdict === "APPROVE";
  const label = fix ? "minor plan fixes" : "plan revision";
  const base = nextStep(run.dir, fix ? "plan-fixes" : "plan-revision");
  const reply = await work(run, "proposal-review", label, "planReviser", base, revisionPrompt(state.change, record.findings, fix), ACK_SCHEMA, isAck);
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

// Implements the approved plan in rounds of an implementer turn, the required checks and a review, within the
// attempt budget. Every round starts with an implementer turn on the owed findings; completing clears them.
async function implementation(run: Run): Promise<Halt | typeof REPLAN | undefined> {
  const { state, setup } = run;
  const budget = setup.attempts ?? setup.config.attempts.implementation;
  let last = "";
  rounds: for (;;) {
    if (run.rounds >= budget) return { cause: `implementation attempts exhausted (${run.rounds} of ${budget})${last}` };
    const at = `attempt ${++run.rounds} of ${budget}`;
    let owed: Findings | undefined = state.owedFindings ? (JSON.parse(readFileSync(state.owedFindings, "utf8")) as Findings) : undefined;
    let fix = owed?.verdict === "APPROVE";
    for (;;) {
      const turn = await implementerTurn(run, at, owed?.findings ?? [], fix);
      if (turn) return turn;
      const failed = await requiredChecks(run, at);
      if ("cause" in failed) return failed;
      if (failed.findings.length > 0) {
        const path = `${nextStep(run.dir, "checks")}.findings.json`;
        writeFileSync(path, `${JSON.stringify({ findings: failed.findings }, null, 2)}\n`);
        owe(run, path);
        last = `; the last attempt's checks failed\nFindings: ${path}`;
        continue rounds;
      }
      if (fix) return complete(state);
      const review = await implementationReview(run, at);
      if ("cause" in review) return review;
      const { record, path } = review;
      const questions = decisionStop(state, `implementation review in ${at}`, record.findings, path);
      if (questions) {
        // The answer is recorded in the plan, so resume reviews the plan before implementing on.
        reopenPlan(state);
        writeState(run.dir, state);
        return questions;
      }
      if (record.findings.length === 0) return complete(state);
      owe(run, path);
      if (record.verdict === "REVISE") {
        const blocking = record.findings.filter((finding) => finding.severity === "blocking").length;
        last = `; the last review was REVISE, ${blocking} blocking\nReview: ${path}`;
        continue rounds;
      }
      owed = record;
      fix = true;
    }
  }
}

// Records that the next implementer turn must address the findings at path.
function owe(run: Run, path: string): void {
  run.state.owedFindings = path;
  writeState(run.dir, run.state);
}

function complete(state: RunState): undefined {
  state.owedFindings = null;
  return undefined;
}

// The commit the change branches from on the base.
function changeBase(run: Run): string {
  return git(run.state.worktree, "merge-base", "HEAD", run.setup.base.ref);
}

// Runs one implementer turn and commits its work. Returns REPLAN when the plan must be reviewed again.
async function implementerTurn(run: Run, at: string, findings: Finding[], fix: boolean): Promise<Halt | typeof REPLAN | undefined> {
  const { state } = run;
  const label = `${at}, ${fix ? "minor fixes" : "implementer"}`;
  const prompt = implementerPrompt(state.change, applyInstructions(state.worktree, state.change), changeBase(run), findings, fix);
  const base = nextStep(run.dir, fix ? "implementation-fixes" : "implementation");
  // The implementer may tick task boxes but not change the plan; planDigest ignores the ticks.
  const plan = planDigest(state.worktree, state.change);
  const reply = await work(run, "implementation", label, "implementer", base, prompt, IMPLEMENTATION_SCHEMA, isImplementation);
  if ("cause" in reply) return reply;
  const alias = run.setup.agents.implementer.alias;
  git(state.worktree, "add", "--all");
  if (git(state.worktree, "status", "--porcelain") === "") {
    progress(`implementation: ${label} made no changes (${alias})`);
  } else {
    const message = fix ? "apply minor implementation fixes" : findings.length > 0 ? "revise implementation" : "implement";
    git(state.worktree, "commit", "--quiet", "-m", `${state.change}: ${message}`);
    progress(`implementation: ${label} committed ${git(state.worktree, "rev-parse", "--short=7", "HEAD")} (${alias})`);
  }
  if (planDigest(state.worktree, state.change) !== plan) {
    const commit = git(state.worktree, "rev-parse", "--short=7", "HEAD");
    progress(`implementation: ${label} changed the plan (${alias})`);
    return {
      cause: `failure of implementer agent "${alias}": it changed the plan beyond ticking task boxes in commit ${commit}`,
      recovery: `revert the plan changes of ${commit} in worktree ${state.worktree} on branch ${state.branch}, then run \`loop resume ${state.change}\``,
    };
  }
  const { planProblem } = reply.value;
  if (planProblem !== null) {
    progress(`implementation: ${at}, implementer reports the plan needs a change (${alias})`);
    const path = `${nextStep(run.dir, "plan-problem")}.json`;
    const finding: Finding = { severity: "blocking", location: "implementation", problem: planProblem, question: null };
    const record: Verdict = { verdict: "REVISE", findings: [finding] };
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
    reopenPlan(state);
    state.owedReview = path;
    writeState(run.dir, state);
    return REPLAN;
  }
  return undefined;
}

// Runs every required check in order. Returns the findings of those that failed, or why the run must stop.
async function requiredChecks(run: Run, at: string): Promise<{ findings: Finding[] } | Halt> {
  const failures: { check: string; outcome: string; transcript: string }[] = [];
  for (const check of run.setup.config.checks) {
    const label = `implementation: ${at}, check \`${check}\``;
    if (run.stopping()) return { cause: USER_STOP };
    progress(`${label} started`);
    const transcript = `${nextStep(run.dir, "check")}.log`;
    const { code, signal } = await run.exec(runStep("sh", ["-c", check], run.state.worktree, transcript));
    if (run.stopping()) {
      progress(`${label} ${USER_STOP}`);
      return { cause: USER_STOP };
    }
    if (code === 0) {
      progress(`${label} passed`);
      continue;
    }
    const outcome = code === null ? `signal ${signal}` : `exit status ${code}`;
    progress(`${label} failed, ${outcome}`);
    failures.push({ check, outcome, transcript });
  }
  const share = Math.floor(CHECK_OUTPUT / failures.length);
  const findings = failures.map(({ check, outcome, transcript }): Finding => ({
    severity: "blocking",
    location: `check \`${check}\``,
    problem: `The check failed with ${outcome}. Transcript: ${transcript}\nThe output ends with:\n${readFileSync(transcript, "utf8").slice(-share)}`,
    question: null,
  }));
  return { findings };
}

// Reviews the committed candidate and records the verdict with the base and candidate commits it covers.
async function implementationReview(run: Run, at: string): Promise<{ record: Findings & { base: string; commit: string }; path: string } | Halt> {
  const { state, setup } = run;
  const base = changeBase(run);
  const commit = git(state.worktree, "rev-parse", "HEAD");
  const label = `${at}, review`;
  const prompt = implementationReviewPrompt(state.change, planFiles(state.worktree, state.change), base, commit, setup.config.checks);
  const step = nextStep(run.dir, "implementation-review");
  const reply = await work(run, "implementation", label, "implementationReviewer", step, prompt, REVIEW_SCHEMA, isReview);
  if ("cause" in reply) return reply;
  const { findings } = reply.value;
  const blocking = findings.filter((finding) => finding.severity === "blocking").length;
  const record = { verdict: blocking > 0 ? ("REVISE" as const) : ("APPROVE" as const), base, commit, findings };
  const path = `${step}.verdict.json`;
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  progress(`implementation: ${label} ${record.verdict}, ${blocking} blocking, ${findings.length - blocking} minor (${setup.agents.implementationReviewer.alias})`);
  return { record, path };
}

// Runs one worker turn of a role and returns its checked reply, or why the run must stop.
async function work<T>(
  run: Run,
  stage: Stage,
  label: string,
  role: Role,
  base: string,
  prompt: string,
  schema: object,
  check: (value: unknown) => value is T,
): Promise<{ value: T } | Halt> {
  const agent = run.setup.agents[role];
  if (run.stopping()) return { cause: USER_STOP };
  progress(`${stage}: ${label} started (${agent.alias})`);
  let problem: string;
  let files: { transcript: string; reply: string } | undefined;
  try {
    const worker = startWorker(agent.command, run.state.worktree, base, prompt, schema);
    files = worker.files;
    const { code, signal } = await run.exec(worker.step);
    if (run.stopping()) {
      progress(`${stage}: ${label} ${USER_STOP} (${agent.alias})`);
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
  progress(`${stage}: ${label} execution failure, ${problem} (${agent.alias})`);
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
