import { join } from "node:path";
import type { Fixture } from "./fixture.js";
import { releaseLock, STAGES, type RunState, type Stage, writeState } from "./state.js";
import { nextTranscript, runStep } from "./step.js";

export function progress(message: string): void {
  const time = new Date().toTimeString().slice(0, 8);
  process.stdout.write(`[${time}] ${message}\n`);
}

export function locations(dir: string, state: RunState): string {
  return `Worktree: ${state.worktree}\nRun directory: ${dir}\nTranscripts: ${join(dir, "transcripts")}\n`;
}

const SIGNALS = ["SIGTERM", "SIGINT", "SIGHUP"] as const;

// Advances the run from its first incomplete stage until every stage completes or one stops.
// The caller holds the run's lock; advance releases it. Returns the exit status.
export async function advance(dir: string, state: RunState, fixture: Fixture): Promise<number> {
  let stopping = false;
  let kill: (() => void) | undefined;
  const onSignal = () => {
    stopping = true;
    kill?.();
  };
  for (const signal of SIGNALS) process.on(signal, onSignal);
  try {
    state.stop = null;
    for (const stage of STAGES) {
      if (state.stages[stage] === "complete") continue;
      if (stopping) return stop(dir, state, stage, "stopped by the user");
      state.current = stage;
      writeState(dir, state);
      progress(`${stage}: started (fixture)`);
      let cause: string | undefined;
      try {
        const step = runStep("sh", ["-c", fixture[stage]], state.worktree, nextTranscript(dir, stage));
        kill = step.kill;
        const { code, signal } = await step.result;
        if (stopping) cause = "stopped by the user";
        else if (code !== 0) cause = code === null ? `execution failure, signal ${signal}` : `execution failure, exit status ${code}`;
      } catch (error) {
        cause = `execution failure of the loop: ${(error as Error).message}`;
      } finally {
        kill = undefined;
      }
      if (cause) {
        progress(`${stage}: ${cause} (fixture)`);
        return stop(dir, state, stage, stopping ? cause : `${cause} (fixture)`);
      }
      state.stages[stage] = "complete";
      state.current = null;
      writeState(dir, state);
      progress(`${stage}: complete (fixture)`);
    }
    process.stdout.write(
      `Run ${state.change} completed. Every stage was a fixture; no stage did real work.\n${locations(dir, state)}`,
    );
    return 0;
  } finally {
    for (const signal of SIGNALS) process.off(signal, onSignal);
    releaseLock(dir);
  }
}

function stop(dir: string, state: RunState, stage: Stage, cause: string): number {
  state.current = null;
  state.stop = { stage, cause, recovery: `loop resume ${state.change}` };
  writeState(dir, state);
  process.stdout.write(
    `Run ${state.change} stopped at ${stage}.\nCause: ${cause}\nRecovery: ${state.stop.recovery}\n${locations(dir, state)}`,
  );
  return 1;
}
