import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Agent, type Config, type Role, ROLES } from "./config.js";
import { type Base, checkoutsHolding, conflicted, defaultSynchronization, DefaultSynchronizationError, dirtyDefaultCheckout, fastForwardDefault, git, gitMessage, gitSucceeds, merging, patchId } from "./git.js";
import { applyInstructions } from "./openspec.js";
import { changeDir, outsideChange, planDigest, planFiles } from "./plan.js";
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
import { nextStep, readReply, readUsage, runStep, startWorker, type Step, type StepResult, type Usage, type WorkerFiles } from "./step.js";

export function progress(message: string): void {
  const time = new Date().toTimeString().slice(0, 8);
  process.stdout.write(`[${time}] ${message}\n`);
}

export function locations(dir: string, state: RunState): string {
  return `Worktree: ${state.worktree}\nRun directory: ${dir}\nTranscripts: ${join(dir, "transcripts")}\n`;
}

// Used only for an incomplete run at a successful stage boundary.
export function continuation(state: RunState): string {
  const next = STAGES.find((stage) => state.stages[stage] !== "complete");
  return `Next stage: ${next}\nContinue: loop step ${state.change} or loop resume ${state.change}`;
}

// The role whose agent runs each worker step, by step name.
const STEP_ROLES: Record<string, Role> = {
  "proposal-review": "proposalReviewer",
  "plan-revision": "planReviser",
  "plan-fixes": "planReviser",
  implementation: "implementer",
  "implementation-fixes": "implementer",
  "implementation-review": "implementationReviewer",
};

// The report's usage block: each role's input, output and cost summed over every worker step of the run, in every
// advancement, with how many steps reported none. Every worker step leaves its prompt among the transcripts.
function usageTotals(dir: string): string {
  const transcripts = join(dir, "transcripts");
  const totals = new Map<Role, { steps: number; withoutUsage: number; costSteps: number; sum: Usage }>();
  for (const file of existsSync(transcripts) ? readdirSync(transcripts) : []) {
    const role = STEP_ROLES[/^\d+-(.+)\.prompt\.md$/.exec(file)?.[1] ?? ""];
    if (role === undefined) continue;
    const total = totals.get(role) ?? { steps: 0, withoutUsage: 0, costSteps: 0, sum: {} };
    totals.set(role, total);
    total.steps++;
    const read = readUsage(join(transcripts, file.replace(/\.prompt\.md$/, ".usage.json")));
    const usage = "usage" in read ? read.usage : undefined;
    if (!hasUsage(usage)) total.withoutUsage++;
    if (usage?.costUsd !== undefined) total.costSteps++;
    for (const key of ["inputTokens", "outputTokens", "costUsd"] as const) {
      if (usage?.[key] !== undefined) total.sum[key] = (total.sum[key] ?? 0) + usage[key];
    }
  }
  if (totals.size === 0) return "";
  const lines = ROLES.flatMap((role) => {
    const total = totals.get(role);
    if (total === undefined) return [];
    const missing = total.steps - total.costSteps;
    const steps = `${plural(total.steps, "step")}${total.withoutUsage > 0 ? `, ${total.withoutUsage} without usage` : ""}`;
    const cost = total.costSteps > 0 && missing > 0 ? `, ${plural(missing, "step")} without cost` : "";
    return [`  ${role}: ${steps}; ${valuesText(total.sum)}${cost}\n`];
  });
  return `Usage by role:\n${lines.join("")}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// Makes proposal review and every later stage incomplete. Findings owed to the implementer predate the plan
// approved next, so they are dropped: implementation after reapproval starts with a full round.
export function reopenPlan(state: RunState): void {
  for (const stage of STAGES) state.stages[stage] = "pending";
  state.owedFindings = null;
}

export interface Setup {
  config: Config;
  agents: Record<Role, Agent>;
  base: Base;
  // Replaces the configured attempt budgets for this advancement.
  attempts: number | undefined;
}

interface Verdict {
  verdict: "APPROVE" | "REVISE";
  findings: Finding[];
}

// A record of findings the implementer must address: an implementation review's verdict with the base it
// covers, or failed checks without either.
interface Findings {
  verdict?: "APPROVE" | "REVISE";
  base?: string;
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

// Advances from the first incomplete stage until completion, a stop, or one successful stage in single-stage mode.
// The caller holds the run's lock; advance releases it. Returns the exit status.
export async function advance(dir: string, state: RunState, setup: Setup, singleStage = false): Promise<number> {
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
      if (step.group !== undefined) {
        state.stepGroup = step.group;
        writeState(dir, state);
      }
      return await step.result;
    } catch (error) {
      // A step whose group could not be recorded must not outlive this advancement unseen.
      step.kill();
      throw error;
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
        else if (stage === "integration") outcome = await integration(run);
        else if (stage === "archive") outcome = await archive(run);
        else outcome = await delivery(run);
      } catch (error) {
        outcome = { cause: `execution failure of the loop: ${(error as Error).message}` };
      }
      if (outcome === REPLAN) continue;
      if (outcome) return stop(dir, state, stage, outcome);
      state.stages[stage] = "complete";
      state.current = null;
      writeState(dir, state);
      progress(`${stage}: complete`);
      if (singleStage && STAGES.some((candidate) => state.stages[candidate] !== "complete")) {
        process.stdout.write(`Run ${state.change} returned control between stages after ${stage}.\n${continuation(state)}\n${locations(dir, state)}${usageTotals(dir)}`);
        return 0;
      }
    }
    process.stdout.write(`Run ${state.change} completed.\n${locations(dir, state)}${usageTotals(dir)}`);
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

// Integrates the change with the current base: brings the base in, then hands the implementer any conflict, patch
// change or failed check on the result. Returns REPLAN with implementation reopened when the implementer must act.
async function integration(run: Run): Promise<Halt | typeof REPLAN | undefined> {
  const { state, setup } = run;
  const { worktree } = state;
  const { base } = setup;
  const name = shortRef(base.ref);
  progress("integration: started");
  // Every implementer turn concludes the merge it was handed, so an operation in progress here was cut off
  // before its handoff; redoing the stage reproduces it.
  if (["rebase-merge", "rebase-apply"].some((dir) => existsSync(git(worktree, "rev-parse", "--path-format=absolute", "--git-path", dir)))) {
    git(worktree, "rebase", "--abort");
    progress("integration: aborted an unfinished rebase");
  }
  if (merging(worktree)) {
    git(worktree, "merge", "--abort");
    progress("integration: aborted an unfinished merge");
  }

  if (base.upstream) {
    const { remote, branch, ref } = base.upstream;
    const fetched = await external(run, "integration", "fetch", "git", ["fetch", "--quiet", remote, branch]);
    if ("cause" in fetched) return fetched;
    progress(`integration: fetched ${shortRef(ref)} at ${git(worktree, "rev-parse", "--short=7", ref)}`);
    if (setup.config.delivery === "merge") {
      const halt = syncDefaultBranch(run);
      if (halt) return halt;
    }
  }

  if (!gitSucceeds(worktree, "merge-base", "--is-ancestor", base.ref, "HEAD")) {
    const at = git(worktree, "rev-parse", "--short=7", base.ref);
    try {
      git(worktree, "rebase", "--quiet", "--no-update-refs", base.ref);
      progress(`integration: rebased onto ${name} at ${at}`);
    } catch (error) {
      const files = conflicted(worktree);
      if (files.length === 0) throw new Error(`\`git rebase ${name}\` failed: ${gitMessage(error)}`);
      git(worktree, "rebase", "--abort");
      progress(`integration: rebase onto ${name} conflicts; merging instead`);
      try {
        git(worktree, "merge", "--quiet", "--ff", "--no-edit", base.ref);
        progress(`integration: merged ${name} at ${at}`);
      } catch (error) {
        const files = conflicted(worktree);
        if (files.length === 0) throw new Error(`\`git merge ${name}\` failed: ${gitMessage(error)}`);
        progress(`integration: merge of ${name} conflicts in ${files.length} file${files.length === 1 ? "" : "s"}`);
        return reopenImplementation(run, "integration", {
          severity: "blocking",
          location: "integration",
          problem: `Merging ${name} (${at}) into the change conflicts in: ${files.join(", ")}. The merge is in progress in this worktree. Resolve every conflict so that both the change and the base's work survive; the loop concludes the merge.`,
          question: null,
        });
      }
    }
  }

  const changeStart = git(worktree, "merge-base", "HEAD", base.ref);
  if (patchId(worktree, changeStart, "HEAD", outsideChange(state.change)) !== state.approvedPatch) {
    progress("integration: the patch changed");
    return reopenImplementation(run, "integration", {
      severity: "blocking",
      location: "integration",
      problem: `Integrating ${name} changed the change's patch. Check that the result still implements the plan, and repair what the integration broke.`,
      question: null,
    });
  }

  const failed = await requiredChecks(run, "integration:");
  if ("cause" in failed) return failed;
  if (failed.findings.length > 0) return reopenImplementation(run, "checks", ...failed.findings);
  return undefined;
}

// Writes findings for the implementer, makes implementation and every later stage incomplete, and owes the findings.
function reopenImplementation(run: Run, name: string, ...findings: Finding[]): typeof REPLAN {
  const path = `${nextStep(run.dir, name)}.findings.json`;
  writeFileSync(path, `${JSON.stringify({ findings }, null, 2)}\n`);
  for (const stage of STAGES.slice(STAGES.indexOf("implementation"))) run.state.stages[stage] = "pending";
  owe(run, path);
  return REPLAN;
}

// In merge mode, brings the local default branch level with its upstream before integrating.
function syncDefaultBranch(run: Run): Halt | undefined {
  const { worktree } = run.state;
  const branch = run.setup.config.defaultBranch;
  const upstream = run.setup.base.upstream!;
  let tips;
  try {
    tips = defaultSynchronization(worktree, branch, upstream);
  } catch (error) {
    const action = error instanceof DefaultSynchronizationError ? error.recovery : "clear what Git names";
    return { cause: gitMessage(error), recovery: `${action}, then run \`loop resume ${run.state.change}\`` };
  }
  if (tips === undefined) return undefined;
  return dirtyHolder(run) ?? fastForward(run, "integration", tips.published, tips.local);
}

// The stop for a checkout that holds the default branch with uncommitted changes to tracked files, if any.
function dirtyHolder(run: Run): Halt | undefined {
  const branch = run.setup.config.defaultBranch;
  const dirty = dirtyDefaultCheckout(run.state.worktree, branch);
  if (dirty === undefined) return undefined;
  return {
    cause: `checkout ${dirty} holds ${branch} with uncommitted changes`,
    recovery: `commit or discard them in ${dirty}, then run \`loop resume ${run.state.change}\``,
  };
}

// Fast-forwards the local default branch to commit, which callers have checked contains it, moving the files
// of the checkout that holds it.
function fastForward(run: Run, stage: Stage, commit: string, expectedOld: string): Halt | undefined {
  const { worktree } = run.state;
  const branch = run.setup.config.defaultBranch;
  const short = git(worktree, "rev-parse", "--short=7", commit);
  try {
    const checkout = fastForwardDefault(worktree, branch, commit, expectedOld);
    progress(`${stage}: fast-forwarded ${branch} to ${short}${checkout ? ` in checkout ${checkout}` : ""}`);
    return undefined;
  } catch (error) {
    const [checkout] = checkoutsHolding(worktree, branch);
    progress(`${stage}: fast-forward of ${branch} failed`);
    return {
      cause: `fast-forwarding ${branch} to ${short}${checkout ? ` in checkout ${checkout}` : ""} failed: ${gitMessage(error)}`,
      recovery: `clear what Git names${checkout ? ` in ${checkout}` : ` or reconcile ${branch}`}, then run \`loop resume ${run.state.change}\``,
    };
  }
}

// Runs a command that acts beyond the run's worktree files through the step runner, keeping its output as a transcript.
async function external(run: Run, stage: Stage, name: string, command: string, args: string[]): Promise<{ transcript: string } | Halt> {
  const transcript = `${nextStep(run.dir, name)}.log`;
  const { code, signal } = await run.exec(runStep(command, args, run.state.worktree, transcript));
  if (run.stopping()) {
    progress(`${stage}: ${USER_STOP}`);
    return { cause: USER_STOP };
  }
  if (code === 0) return { transcript };
  const line = [command, ...args].join(" ");
  const outcome = code === null ? `signal ${signal}` : `exit status ${code}`;
  progress(`${stage}: \`${line}\` failed, ${outcome}`);
  const output = readFileSync(transcript, "utf8").trim();
  return { cause: `\`${line}\` failed with ${outcome}${output ? `:\n${output}` : ""}\nTranscript: ${transcript}` };
}

// Delivers the archived change as the configured mode says.
async function delivery(run: Run): Promise<Halt | undefined> {
  const { state, setup } = run;
  const { worktree, branch, change } = state;
  progress("delivery: started");
  if (setup.config.delivery === "local") {
    progress("delivery: local, nothing pushed");
    return undefined;
  }
  const { remote, branch: remoteBranch } = setup.base.upstream!;
  const head = git(worktree, "rev-parse", "--short=7", "HEAD");
  const resume = `loop resume ${change}`;
  if (setup.config.delivery === "pr") {
    // No -u: the loop does not change Git configuration.
    const pushed = await external(run, "delivery", "push", "git", ["push", "--quiet", remote, `${branch}:refs/heads/${branch}`]);
    if ("cause" in pushed) return pushed;
    progress(`delivery: pushed ${branch} to ${remote} at ${head}`);
    const repository = git(worktree, "remote", "get-url", remote);
    const listed = await external(run, "delivery", "pr-list", "gh", [
      "pr", "list", "--repo", repository, "--head", branch, "--base", remoteBranch, "--state", "open", "--json", "url", "--jq", ".[].url",
    ]);
    if ("cause" in listed) return listed;
    const [open] = urls(listed.transcript);
    if (open !== undefined) {
      progress(`delivery: pull request already open: ${open}`);
      return undefined;
    }
    const created = await external(run, "delivery", "pr-create", "gh", [
      "pr", "create", "--repo", repository, "--base", remoteBranch, "--head", branch, "--title", change, "--body-file", archivedProposal(worktree, change),
    ]);
    if ("cause" in created) return created;
    progress(`delivery: opened pull request ${urls(created.transcript).at(-1)}`);
    return undefined;
  }
  const defaultBranch = setup.config.defaultBranch;
  const dirty = dirtyHolder(run);
  if (dirty) return dirty;
  const checkedDefault = git(worktree, "rev-parse", defaultBranch);
  if (!gitSucceeds(worktree, "merge-base", "--is-ancestor", checkedDefault, "HEAD")) {
    return {
      cause: `${defaultBranch} has commits that branch ${branch} lacks`,
      recovery: `bring ${defaultBranch} into branch ${branch} in worktree ${worktree}, then run \`${resume}\``,
    };
  }
  // The push comes first, so a rejected push leaves the local default branch where it was.
  const pushed = await external(run, "delivery", "push", "git", ["push", "--quiet", remote, `HEAD:refs/heads/${remoteBranch}`]);
  if ("cause" in pushed) {
    if (pushed.cause === USER_STOP) return pushed;
    return { ...pushed, recovery: `bring ${remoteBranch} from ${remote} into branch ${branch} in worktree ${worktree}, then run \`${resume}\`` };
  }
  progress(`delivery: pushed ${head} to ${remoteBranch} on ${remote}`);
  return fastForward(run, "delivery", git(worktree, "rev-parse", "HEAD"), checkedDefault);
}

// The URLs a gh command printed, in order.
function urls(transcript: string): string[] {
  return readFileSync(transcript, "utf8").split("\n").filter((line) => /^https?:\/\/\S+$/.test(line));
}

// The change's proposal under the archive, taking the newest when the change was archived more than once.
function archivedProposal(worktree: string, change: string): string {
  const archive = join(worktree, "openspec/changes/archive");
  const [newest] = readdirSync(archive).filter((name) => /^\d{4}-\d{2}-\d{2}-/.test(name) && name.slice(11) === change).sort().reverse();
  return join(archive, newest, "proposal.md");
}

function shortRef(ref: string): string {
  return ref.replace(/^refs\/remotes\//, "");
}

// Archives the change with native OpenSpec, which validates it and applies its spec deltas, and commits the result.
async function archive(run: Run): Promise<Halt | undefined> {
  const { state } = run;
  progress("archive: started");
  // OpenSpec moves the change out of the changes directory, so once it is gone an earlier archive ran,
  // and at most its commit is missing.
  if (!existsSync(join(state.worktree, changeDir(state.change)))) {
    progress("archive: change already archived");
  } else {
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
  }
  git(state.worktree, "add", "--all");
  if (git(state.worktree, "status", "--porcelain") === "") return undefined;
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
    progress(`proposal-review: ${label} ${record.verdict}, ${blocking} blocking, ${findings.length - blocking} minor ${reply.tag}`);

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
  if (git(state.worktree, "status", "--porcelain", "--", dir) === "") {
    progress(`proposal-review: ${label} made no changes ${reply.tag}`);
    return undefined;
  }
  const message = fix ? `${state.change}: apply minor plan fixes` : `${state.change}: revise plan`;
  git(state.worktree, "commit", "--quiet", "-m", message, "--", dir);
  progress(`proposal-review: ${label} committed ${git(state.worktree, "rev-parse", "--short=7", "HEAD")} ${reply.tag}`);
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
      const failed = await requiredChecks(run, `implementation: ${at},`);
      if ("cause" in failed) return failed;
      if (failed.findings.length > 0) {
        const path = `${nextStep(run.dir, "checks")}.findings.json`;
        writeFileSync(path, `${JSON.stringify({ findings: failed.findings }, null, 2)}\n`);
        owe(run, path);
        last = `; the last attempt's checks failed\nFindings: ${path}`;
        continue rounds;
      }
      if (fix) return complete(state, owed!.base!);
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
      if (record.findings.length === 0) return complete(state, record.base);
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

// Records the patch the approval covers, against the base its review saw; the caller writes state as it marks the stage complete.
function complete(state: RunState, base: string): undefined {
  state.owedFindings = null;
  state.approvedPatch = patchId(state.worktree, base, "HEAD", outsideChange(state.change));
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
  // A merge integration left in progress is concluded with Git's message, even when the resolution changed nothing.
  const concluding = merging(state.worktree);
  if (!concluding && git(state.worktree, "status", "--porcelain") === "") {
    progress(`implementation: ${label} made no changes ${reply.tag}`);
  } else {
    const message = fix ? "apply minor implementation fixes" : findings.length > 0 ? "revise implementation" : "implement";
    if (concluding) git(state.worktree, "commit", "--quiet", "--no-edit");
    else git(state.worktree, "commit", "--quiet", "-m", `${state.change}: ${message}`);
    progress(`implementation: ${label} committed ${git(state.worktree, "rev-parse", "--short=7", "HEAD")} ${reply.tag}`);
  }
  if (planDigest(state.worktree, state.change) !== plan) {
    const commit = git(state.worktree, "rev-parse", "--short=7", "HEAD");
    progress(`implementation: ${label} changed the plan ${reply.tag}`);
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

// Runs every required check in order, labelling its progress lines with prefix. Returns the findings of those
// that failed, or why the run must stop.
async function requiredChecks(run: Run, prefix: string): Promise<{ findings: Finding[] } | Halt> {
  const failures: { check: string; outcome: string; transcript: string }[] = [];
  for (const check of run.setup.config.checks) {
    const label = `${prefix} check \`${check}\``;
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
  progress(`implementation: ${label} ${record.verdict}, ${blocking} blocking, ${findings.length - blocking} minor ${reply.tag}`);
  return { record, path };
}

// Runs one worker turn of a role and returns its checked reply with the suffix that ends its end line
// (the agent's alias and the turn's usage), or why the run must stop.
async function work<T>(
  run: Run,
  stage: Stage,
  label: string,
  role: Role,
  base: string,
  prompt: string,
  schema: object,
  check: (value: unknown) => value is T,
): Promise<{ value: T; tag: string } | Halt> {
  const agent = run.setup.agents[role];
  if (run.stopping()) return { cause: USER_STOP };
  progress(`${stage}: ${label} started (${agent.alias})`);
  let problem: string | undefined;
  let files: WorkerFiles | undefined;
  let exit: StepResult | undefined;
  try {
    const worker = startWorker(agent.command, run.state.worktree, base, prompt, schema);
    files = worker.files;
    exit = await run.exec(worker.step);
  } catch (error) {
    problem = (error as Error).message;
  }
  const usage = files ? readUsage(files.usage) : {};
  const tag = `(${agent.alias}; ${"problem" in usage ? "usage unavailable" : usageText(usage.usage)})`;
  if (exit && run.stopping()) {
    progress(`${stage}: ${label} ${USER_STOP} ${tag}`);
    return { cause: USER_STOP };
  }
  if (exit && files) {
    if (exit.code !== 0) problem = exit.code === null ? `signal ${exit.signal}` : `exit status ${exit.code}`;
    else {
      const reply = readReply(files.reply, check);
      if ("problem" in reply) problem = reply.problem;
      else if ("problem" in usage) problem = usage.problem;
      else return { value: reply.value, tag };
    }
  }
  progress(`${stage}: ${label} execution failure, ${problem} ${tag}`);
  const where = files ? `\nTranscript: ${files.transcript}\nReply: ${files.reply}\nUsage: ${files.usage}` : "";
  return { cause: `execution failure of ${role} agent "${agent.alias}" in ${label}: ${problem}${where}` };
}

// A step's usage for its end line: its input, output and cost, each unavailable when the worker did not report it.
function usageText(usage: Usage | undefined): string {
  return hasUsage(usage) ? valuesText(usage) : "usage unavailable";
}

function hasUsage(usage: Usage | undefined): usage is Usage {
  return usage?.inputTokens !== undefined || usage?.outputTokens !== undefined || usage?.costUsd !== undefined;
}

function valuesText({ inputTokens, outputTokens, costUsd }: Usage): string {
  const count = (value: number | undefined) => (value === undefined ? "unavailable" : value.toLocaleString("en-US"));
  return `input ${count(inputTokens)}, output ${count(outputTokens)}, cost ${costUsd === undefined ? "unavailable" : `$${costUsd.toFixed(2)}`}`;
}

function stop(dir: string, state: RunState, stage: Stage, halt: Halt): number {
  state.current = null;
  state.stop = { stage, cause: halt.cause, recovery: halt.recovery ?? `loop resume ${state.change}` };
  writeState(dir, state);
  process.stdout.write(
    `Run ${state.change} stopped at ${stage}.\nCause: ${halt.cause}\nRecovery: ${state.stop.recovery}\n${locations(dir, state)}${usageTotals(dir)}`,
  );
  return 1;
}
