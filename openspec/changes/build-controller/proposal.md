## Why

The package declares a `loop` command that only prints usage, so nothing can run a change yet. Issues #4 to #7 each replace one stage with real work. Before they can, they need what every stage shares: configuration, enrollment, the run's branch and worktree, run state, one active advancement per run, the `run`/`status`/`stop`/`resume` commands, progress lines, transcripts, and a skill that lets a Claude or Codex session supervise a run.

The contract also allows only one way to start: a proposal committed on the default branch. A change cannot be carried from proposal to merge in a single worktree on its own branch. This change makes the change's branch the place the proposal must be, whichever way it got there.

## What Changes

- Read the loop configuration from `openspec/loop.yaml` on every `run` and `resume`. It holds only what this change uses: the default branch, which the loop reads from configuration and does not detect. The delivery mode, roles, restrictions, attempts and required checks arrive with the steps that use them. `yaml` becomes the first runtime dependency.
- Enroll a change by its branch. `loop run <change>` on a branch other than the default branch makes that branch and its worktree the run's own, and refuses unless the proposal is committed there and the worktree has no uncommitted changes. `loop run <change>` on the default branch creates a new branch for the change from that commit, in a worktree the loop owns, and refuses unless the proposal is committed there. In every delivery mode the change's branch starts from the commit holding the proposal.
- Add `loop run <change>`. Besides enrollment, it refuses unless the `openspec` on PATH is 1.14.0 or later and the configuration is well formed, and it refuses a change that already has a run. Otherwise it advances the run through its stages in the foreground and exits with a report.
- Add `loop status <change>`, `loop stop <change>` and `loop resume <change>`. They work from any checkout of the repository. Stop ends the current step at once. Resume continues from the first incomplete stage, redoes an interrupted step, and takes over a run whose advancing process died. A run accepts one active advancement at a time.
- Print a progress line when each step starts and when it ends, and keep each step's output as a transcript that the report names.
- Run every stage as a fixture until #4 to #7 make it real. A fixture stage runs a shell command from a file named by `LOOP_FIXTURE` in the run's worktree, and every line and report marks fixture outcomes as simulated. Usage and cost reporting arrives in #8.
- Ship a thin supervision skill for Claude and Codex. It starts a run in the background, relays its progress lines, reads the report and transcripts, and stops or resumes with the user's agreement. Diagnosis guidance arrives in #8.
- Support Linux and macOS, and run CI on both. Windows support is tracked in #16.
- Install no hooks.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: adds a Loop configuration requirement (file location, the default branch field, refusal of malformed configuration). Explicit enrollment, Attended proposal and Integration and delivery change so that the proposal must be committed on the change's branch, which is either the branch `loop run` is given on or a new branch the loop creates from the default branch; the base remains what the change is integrated with and delivered to. Run control gains two behaviors: `loop run` refuses a change that already has a run, and resume takes over a run whose advancing process died.

## Impact

- New code in `src/` for the configuration, enrollment, the run's branch and worktree, run state and lock, the controller, fixture stages and commands, with tests that drive the built `loop` command in temporary Git repositories against a stub `openspec` on PATH. `src/cli.ts` drops its usage-only body.
- New runtime dependency: `yaml`.
- New file: the supervision skill under `skills/`. Packaging it and installing it into other projects is left to #10.
- Run state and loop-created worktrees live in the repository's Git directory, outside every working tree, so they create no untracked files.
- `README.md` documents the configuration, both ways to start a run, and the commands.
