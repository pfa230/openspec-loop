## Context

The package builds a `loop` bin that prints usage and exits 2 (`src/cli.ts`), tested by `test/cli.test.ts` through `package.json` `bin.loop`. Tests compile with `tsc` and run under `node:test`; `npm test` is the only check, and CI does not install OpenSpec. The `loop-workflow` contract already specifies controller ownership, run control, progress reporting and the OpenSpec CLI floor. Its enrollment rule required the proposal on the default branch; this change replaces it with the change's branch. This change builds what all stages share and leaves the stages themselves as fixtures. See proposal.md for motivation and the `loop-workflow` delta for the requirements.

## Goals / Non-Goals

**Goals:**
- `loop run`, `status`, `stop` and `resume` behave as the contract says, from a terminal and from a supervising session, before any stage does real work.
- A change can run from either starting point: a proposal committed on the default branch, or a proposal committed on a branch of its own in its own worktree.
- #4 to #7 each replace one fixture stage with real work without changing the commands, enrollment, the state layout or the progress format.

**Non-Goals:**
- The delivery mode, roles, execution restrictions, attempt limits and required checks, in configuration or in code. Each arrives with the step that first uses it: roles and restrictions with #4 and #5, attempts with #4, checks with #5, the delivery mode with #7.
- Fetching from the remote, integration with the base, archival and delivery (#6, #7). Usage and cost figures (#8). Diagnosis guidance in the skill (#8).
- Installing the skill into other projects (#10).
- Windows (#16). Stop, step termination and fixture commands rely on POSIX signals, process groups and `sh`, so this change supports Linux and macOS. pfa chose this over a portable stop path now; #16 records what Windows needs.
- A command to discard a run. To start over, the user removes a loop-created worktree with `git worktree remove`, deletes a loop-created branch with `git branch -D loop/<change>`, and deletes the run directory, which the report names.

## Decisions

**Configuration is `openspec/loop.yaml` with one field.** It sits next to OpenSpec's own `config.yaml` and is committed with the repository. It holds `defaultBranch`, which is required:

```yaml
defaultBranch: main
```

Enrollment needs the default branch to tell the two starting points apart. Nothing else has a consumer yet, so nothing else is read; the delivery mode arrives with #7, which first uses it. Unknown keys are refused, so a misspelled field fails loudly instead of being ignored. pfa chose YAML over JSON, so the `yaml` package (no dependencies of its own) becomes the first runtime dependency. The loop reads the file from the top level of the invoking checkout on every `run` and `resume`. Re-reading lets a user fix the configuration of a stopped run and resume it, and it means a run never holds a configuration snapshot that could drift from the file.

**The default branch is configured, not detected.** pfa chose this over detecting `origin/HEAD` with a fallback to the main worktree's branch. A configured branch is one rule that works for repositories without a remote, and it costs one line the user writes once.

**The proposal must be on the change's branch.** pfa chose this over requiring the proposal on the run's base: the loop does not care where the proposal was written, only that the branch it runs on holds it, whether it was committed on the default branch before branching or on the change's branch after. The change's branch is decided by where `loop run` is given:

- On a branch other than the default branch, that branch is the change's branch and the run works in the invoking worktree. The worktree must have no uncommitted changes, untracked files included, so nothing in progress is swept into the run.
- On the default branch, the loop creates branch `loop/<change>` from the invoking checkout's HEAD in a worktree at `<git-common-dir>/openspec-loop/<change>/worktree`. The invoking checkout's uncommitted changes do not block the run, because the proposal and the branch's starting point come from the committed HEAD, and enrollment changes neither the default branch nor that checkout. The configuration is the one exception: it is read from that checkout's working file, as described above. If `loop/<change>` already exists, `git worktree add -b` refuses, and the loop reports Git's message as the refusal.

In both cases `loop run` refuses unless `openspec/changes/<change>/proposal.md` exists in the tree of the invoking HEAD (`git cat-file -e HEAD:<path>`), naming the path and the branch. A detached HEAD is refused because there is no branch to run on. The OpenSpec root is taken to be `openspec/` at the repository's top level, which is where native `openspec init` puts it. The change name needs no validation of its own: a name that is not a change directory in the commit fails the proposal check.

The change's branch starts from the commit holding the proposal in every delivery mode. An earlier draft started `pr`-mode branches from `origin/<default>` so that unpushed commits on local main could not ride into a pull request; pfa rejected it as unneeded. Those commits are the user's own, `pr` mode merges nothing, and the pull request diff shows them. Keeping the rule would have refused a proposal committed on local main and not yet pushed. The base now only names what the change is integrated with and delivered to, which #7 implements; this change does not read it.

A worktree inside the Git directory was verified with Git: `git worktree add` accepts the path, commits from it land on its branch, and the main checkout's `git status` stays clean. The alternative, `.worktrees/<change>` at the repository's top level, shows as untracked in the user's checkout unless the loop edits `.git/info/exclude`, which would be the loop changing the user's Git configuration.

**Run state lives in the Git common directory.** Each run has a directory at `<git-common-dir>/openspec-loop/<change>/` holding `state.json`, `lock`, `transcripts/` and, on the default-branch path, `worktree/`. The common directory is shared by every worktree of the repository and is never part of a working tree, so runs create no untracked files and are visible from any checkout: `status`, `stop` and `resume` work wherever they are given. Runs of different changes use different directories and share nothing. `state.json` records the change's branch and worktree path, each stage as `pending` or `complete`, the stage in progress, and the stop record (stage, cause, recovery). It is written to a temporary file and renamed, so a crash never leaves it half written. It records nothing the loop does not read back.

**A PID lock file guards advancement.** `run` and `resume` write their PID to a private file and hard-link it to `lock`, which fails when `lock` exists, so a reader never sees a lock without its PID. When the file exists and that PID is alive, the command refuses and names the PID. When the PID is dead, the previous advancement died. The command then removes the lock, takes the run over and redoes the step that was in progress, as the new Run control scenario requires. Node has no `flock`, and a daemon that owns runs would be a second process to supervise; a PID file is the smallest mechanism that refuses a live advancement and recovers from a dead one.

**`run` and `resume` advance in the foreground.** The contract has `run` exit with a report, so the process that advances the run is the command itself. A supervising session runs it in the background and reads its output; a terminal user watches it directly. Both get the same output. Exit status is 0 when the run completes, 1 when it stops, and 2 when the command refuses or is misused and nothing advanced.

**Stages form a fixed ordered list.** The stages are `proposal-review`, `implementation`, `integration`, `archive` and `delivery`, following the contract's order: integration comes before the pre-archive gate, and the gate belongs to archive. The controller runs the first incomplete stage, marks it complete on success, and repeats until every stage is complete or one stops. Each stage is a function returning `complete` or a stop with cause and recovery. #4 to #7 swap a fixture for a real function and may split a stage into steps. Invalidating a completed stage when its inputs change arrives with the first stage that records approved inputs (#4).

**Every step runs as a child process with its own transcript.** A step runs in the run's worktree in its own process group, with stdout and stderr streamed to `transcripts/<NNN>-<stage>.log`, numbered so repeated steps never overwrite each other. A nonzero exit or a signal is an execution failure: the run stops, and the cause names the exit status or signal. The loop does not retry. Real workers in #4 and #5 reuse this runner.

**Stop signals the advancing process.** `loop stop <change>` reads the PID from `lock`, sends `SIGTERM` and waits until the lock is released. The advancing process handles `SIGTERM`, `SIGINT` and `SIGHUP` alike, so Ctrl-C in a terminal and closing the terminal behave the same as `loop stop`. Without `SIGHUP`, closing the terminal would kill the controller and leave the step, which runs in its own process group, working in the worktree. The advancing process kills the current step's process group with `SIGKILL`, because the contract says stop ends the step at once and a worker that ignored a gentler signal would leave the stop hanging. It then records the stop with cause "stopped by the user" and recovery `loop resume <change>`, prints the report and exits 1. The interrupted stage stays incomplete, so resume redoes it.

**Taking over a dead advancement treats its step as interrupted.** In this change every step is a fixture with no external effects, so an interrupted step is simply run again. The changes that add archival, merge, push and pull request creation (#6, #7) inspect those effects before replaying, as the Run control requirement says. Stopping a run with no live advancement prints that the run is not advancing and exits 0, because the requested end state already holds.

**Progress lines and reports go to stdout.** Each step prints a start line and an end line, prefixed with the local time:

```
[14:02:11] proposal-review: started (fixture)
[14:02:13] proposal-review: complete (fixture)
[14:02:13] implementation: started (fixture)
[14:02:20] implementation: execution failure, exit status 3 (fixture)
```

Worker steps in #4 and #5 put the role, harness and model where these lines say `fixture`. Creating the change's branch and worktree on the default-branch path is reported as its own line before the first stage. The report follows the last line: on a stop it names the stage, the cause, the recovery command, the run's worktree, the run directory and the transcripts directory, and on completion it says the run completed. `loop status <change>` prints the same facts from `state.json` without taking the lock: the change's branch and worktree, each stage's state, whether an advancement is live, the stop record, and the transcripts directory. A run whose lock names a dead PID shows as interrupted, with `loop resume` as the recovery. `status` for a change with no run exits 2.

**Fixture stages run commands from `LOOP_FIXTURE`.** The issue asks for runs exercised with stage fixtures until real stages exist, with simulated outcomes visibly identified. `LOOP_FIXTURE` names a YAML file mapping each stage to a shell command:

```yaml
proposal-review: "true"
implementation: "sleep 20"
integration: "true"
archive: "true"
delivery: "true"
```

A fixture stage runs its command with `sh -c` in the run's worktree through the step runner. Exit 0 completes the stage; anything else stops the run as an execution failure. The command decides the outcome, so a test can script a crash, a slow step to stop, or a failure that a marker file turns into success on resume. Every progress line and report from a fixture stage says `fixture`, and the completion report states that no stage did real work. Before advancing, `run` and `resume` refuse when `LOOP_FIXTURE` is unset or does not name every fixture stage, because a stage that silently completed would report work nobody did. An environment variable keeps the command line limited to the four contract commands. A fixture harness named in configuration was rejected because there is no role configuration yet. The fixture runner exists only while some stage is unimplemented; the change that makes the last stage real removes it.

**The supervision skill is one `SKILL.md` in the repository.** It lives at `skills/openspec-loop/SKILL.md`. How it is packaged and installed into other projects is #10's decision. Claude and Codex both read the same `SKILL.md` format: Claude from `.claude/skills/`, Codex from `.agents/skills/`, which is where native OpenSpec already installs its skills for each harness. The skill tells the session to start `loop run <change>` as a background command, relay each new progress line to the user as it appears, read the report when the command exits, and point to the transcripts. It runs `loop stop` or `loop resume` only when the user agrees. Claude Code can run a command in the background and read its growing output. How Codex waits on a long background command, or whether it must poll `loop status` instead, is verified during implementation (task 4.1). The skill then states the method for each harness. Until #10, acceptance copies it into the test repository.

**CI runs on Linux and macOS.** The workflow's job gains a matrix of `ubuntu-latest` and `macos-latest`, so the supported platforms are checked rather than assumed. Process groups and signal handling are where the two could differ, and there is no macOS machine to test on by hand.

**Tests drive the built command in temporary repositories.** Each test creates a Git repository in a temporary directory, commits a proposal and `openspec/loop.yaml` on the branch the test needs, puts a stub `openspec` script that prints a chosen version first on PATH, and runs the compiled `loop` with `spawn`. This exercises the real bin entry, Git, worktrees, the lock and signals, and it keeps CI free of an OpenSpec install, because this change only calls `openspec --version`. Stop and concurrency tests use fixture commands that sleep.

## Risks / Trade-offs

- [A PID reused by an unrelated process makes a dead advancement look alive] → The refusal names the PID, so the user can check it and delete the lock by hand. This is rare on a workstation and it fails loudly, never silently.
- [Two `resume` commands racing to take over the same stale lock could both proceed] → It needs a crash followed by two resumes within milliseconds of each other, and resumes are deliberate acts. Node has no file-lock API, and a kernel lock is platform-specific while the loop must run wherever OpenSpec does. pfa rejected a takeover protocol as overengineering, so this is accepted.
- [A controller killed alone, by `SIGKILL` or the OOM killer, leaves its step running] → The step keeps running in its own process group and a resume would start a second copy. It takes a hard kill of the controller alone; closing the terminal is handled through `SIGHUP`. pfa rejected tracking the step's process group as overengineering, so this is accepted.
- [The fixture runner and `LOOP_FIXTURE` ship in the package until #7] → The package is private until #10, and every fixture outcome is labeled. The change that makes the last stage real deletes the runner.
- [`SIGKILL` gives a worker no chance to clean up] → Workers in #4 and #5 write only inside the run's worktree, and resume redoes the interrupted step from the recorded state.
- [Re-reading the configuration on resume lets the default branch change mid-run] → Accepted, as a deliberate edit by the user. The change's branch is fixed at `loop run` and recorded in state, so the edit only affects later stages that read the default branch.
- [Running `loop run` on a change branch in the main checkout makes the main checkout the run's worktree] → Accepted as a deliberate act. Running it on the default branch leaves the main checkout untouched.
- [A loop-created worktree inside the Git directory is hard to find by browsing] → The progress line that creates it, the report and `loop status` each name its path.
