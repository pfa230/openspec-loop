## Context

The contract is `openspec/specs/loop-workflow/spec.md`. The test suite covers it with stub agents and stub OpenSpec, and #4 to #8 each ran their own stage once with real harnesses. Harness versions on this host: Claude Code 2.1.291, Codex 0.160.0, Antigravity 1.2.17, OpenCode 1.18.34, OpenSpec 1.14.0. `gh` is logged in as pfa230. See proposal.md for why.

## Goals / Non-Goals

**Goals:**

- Every case in the proposal runs once against the contract, with its result on issue #9.
- A reader of #9 can follow each case's evidence without the run's files: the setup, the commands typed, the report and the resulting Git state.

**Non-Goals:**

- Reproducing runs on CI. The evidence is one observed run per case.
- Checking harness or model quality. A real worker's output only has to drive the case it was set up for.

## Decisions

**1. Defects become their own issues, and their cases run again.** When a case breaks the contract, the evidence comment says so and a new issue records the defect. The fix goes through its own change. Once the fix is merged, this change's branch takes the default branch and the case runs again. A defect whose fix is not merged blocks this change, because #9's acceptance asks for the workflow to satisfy the contract. Alternative rejected by pfa: fixing defects in this change, which leaves its code work unknown when proposal review approves it.

**2. Evidence lives on issue #9, and nothing else is written to the repository.** Each run gets one comment, and a closing comment maps every case to pass, defect (with its issue) or unsupported. A run comment holds:

- **Setup:** the repository, `openspec/loop.yaml`, the supervisor and the harness versions.
- **What happened:** the commands typed, the progress lines and report, the exit status and the Git state that shows the outcome.
- **Usage:** the `Usage by role` block.

Alternative rejected by pfa: an evidence file in the change directory or under `docs/`.

**3. The loop under test is this branch's build, linked onto PATH.** `npm ci`, `npm run build` and `npm link` in this worktree put `loop` and the four adapters on PATH. The branch carries no code, so the build is the default branch's code, including any merged defect fixes after the branch takes the default branch again. `npm unlink -g openspec-loop` removes the link at the end. #10 covers installation from the packaged artifact.

**4. Every run uses real workers.** The test suite is the fixture coverage, with stub agents and stub OpenSpec; these runs are the real evidence, with real harnesses, real OpenSpec and real Git throughout. One rule for every case keeps the evidence uniform; the cases that depend only on Git state, in run F, add little usage because completed stages do not rerun on resume.

**5. Failures are induced through real inputs, not faked replies.**

| Case | How it is induced |
|---|---|
| Plan revision | The plan has a deliberate gap: a task that requires a behavior the spec delta does not state. |
| Implementation revision | A required check, kept outside the repository and not mentioned by the plan, fails on any line longer than 50 characters under `src/`, as in #5. |
| Decision stop | The plan leaves open a user-visible choice between two plausible behaviors. |
| Harness failure | The agent is a real adapter given a model name that does not exist, so its first worker step exits nonzero. |
| Attempt exhaustion | A required check fails on the base for a reason the change does not cause, with `attempts.implementation: 2`. |
| Moved default branch | A second clone pushes an unrelated commit to `origin/main` while implementation runs. |
| Killed advancing process | `kill -9` on the `loop run` process during a worker step. |

**6. Supervisors are interactive sessions in tmux.** People supervise from the interactive Claude Code and Codex apps, and the skill's watch steps are written for them, so headless print mode would test something else. Each supervisor is `claude` or `codex` started in a tmux pane in the disposable repository, with the skill copied to `.claude/skills/openspec-loop/` and `.agents/skills/openspec-loop/`. The applier types the user's turns with `tmux send-keys`, and `tmux capture-pane -p -S -` saves the session's rendered transcript when the run ends. Every agreement to resume, stop or record a decision is a separate user turn, never part of the first prompt.

**7. Six runs cover the cases, one supervisor and one delivery mode each.** Combining cases bounds the real usage. Each run uses its own disposable repository with real OpenSpec and a small shell project whose required check is `sh test.sh`.

| Run | Supervisor | Delivery | Where proposed | Roles | Cases |
|---|---|---|---|---|---|
| A | Claude Code | `merge`, bare local `origin` | default branch, pushed | reviewer `loop-codex`, reviser and implementer `loop-claude`, implementation reviewer `loop-agy` | plan revision, implementation revision, moved default branch, a behind local default branch fast-forwarded, merge delivery |
| B | Codex | `pr`, private disposable GitHub repository | its own branch in a worktree | reviewer `loop-opencode`, reviser and implementer `loop-codex`, implementation reviewer `loop-claude` | decision stop answered in the session, `loop stop` during implementation and resume, pull request delivery |
| C | terminal | `local` | default branch | one agent in all four roles | harness failure on the first `loop run`, diagnosed by a Claude and a Codex session, then fixed in `openspec/loop.local.yaml` and resumed; same model in every role; local delivery |
| D | terminal | `local` | default branch, same repository as C | as C | a concurrent run of a second change started while C runs; a killed advancing process taken over by `loop resume`; native OpenSpec work in the main checkout during both runs |
| E | terminal | `local` | default branch | real implementer and implementation reviewer | attempt exhaustion, diagnosed by a Claude and a Codex session |
| F | terminal | `merge`, bare local `origin` | default branch | one agent in all four roles | the loud stops: a dirty checkout, unpushed commits, diverged branches and a rejected push, each followed by its recovery and resume |

Readonly reviewer and editing arguments follow the README's adapter table. Native work in D means creating, editing and archiving a third change with `openspec` commands and committing it, then checking that neither run reacts and that `.git/hooks` holds only Git's samples.

**8. Two measurements, taken from the runs.**

- **Usage.** The `Usage by role` block of every report goes into its run's comment. The implementer's end lines in A and E give its usage per attempt: what a fresh context costs on a second attempt compared with the first. That is the evidence #5 deferred for reusing harness sessions.
- **Operator steps.** For each delivery mode, the commands a person types from a committed proposal to the delivered result on the clean path, taken from A, B and C. Each recovery adds its own commands, counted from the stop that needed it.

Alternative rejected by pfa: line counts against `openspec-loop-legacy2`.

## Risks / Trade-offs

- [A real worker does not produce the behavior a case needs, such as a reviewer that approves the deliberate gap] → Sharpen the input and run the case again. The evidence keeps both runs. A case that still does not occur after a second input is reported as unsupported with both attempts, not as a pass.
- [Real runs spend money] → Six runs, each covering several cases. Every report shows the spend.
- [The private GitHub repository outlives the change] → Its URL goes in B's comment so pfa can delete it. The applier does not delete it.
- [A defect fix takes long and blocks #10] → Accepted. #10 releases the workflow #9 validates.
- [One observed run is not proof of determinism] → Accepted. The test suite covers determinism with stubs; this change shows the real system meets the contract.
