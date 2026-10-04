# openspec-loop

openspec-loop takes an OpenSpec change you proposed and committed, and runs it unattended to a reviewed, implemented, tested, archived and delivered result. You attend the proposal; the loop handles everything after it.

The loop is under construction. Its contract is [`openspec/specs/loop-workflow/spec.md`](openspec/specs/loop-workflow/spec.md), and the build steps are tracked as GitHub issues.

## Prerequisites

- Node 24 or later, on Linux or macOS (Windows is tracked in #16)
- OpenSpec 1.14.0 or later, as the `openspec` command on PATH
- Git

## Configuration

Commit `openspec/loop.yaml` in the repository. It names the default branch, which the loop does not detect:

```yaml
defaultBranch: main
```

The loop reads the file from the checkout where you give `loop run` or `loop resume`, every time you give either. A missing file, invalid YAML, a missing field or an unknown key refuses the command.

## Running a change

Propose the change with native `/opsx:propose` and commit it. The proposal must be committed on the branch the run works on, which you choose by where you give `loop run`:

- **On the default branch.** Commit the proposal on the default branch and run `loop run <change>` there. The loop creates branch `loop/<change>` from that commit in a worktree of its own and leaves your checkout untouched.
- **On a branch of its own.** Create a worktree on a new branch, propose and commit there, and run `loop run <change>` in that worktree. The run works in that worktree, which must have no uncommitted changes.

The commands work from any checkout of the repository:

| Command | What it does | Exit status |
|---|---|---|
| `loop run <change>` | Starts a run and advances it in the foreground, printing a progress line as each step starts and ends, then a report. | 0 completed, 1 stopped, 2 refused |
| `loop resume <change>` | Continues a stopped or interrupted run from its first incomplete stage. | 0 completed, 1 stopped, 2 refused |
| `loop stop <change>` | Ends the current step at once; the run reports how to resume. Ctrl-C and closing the terminal do the same. | 0, 2 if there is no run |
| `loop status <change>` | Shows the run's state, branch, stages and locations. | 0, 2 if there is no run |

A run accepts one advancement at a time. If the process advancing it dies, `loop resume` takes the run over and redoes the step that was in progress.

Each run keeps its state in the repository's Git directory, at `.git/openspec-loop/<change>/`: `state.json`, the transcripts of every step under `transcripts/`, and, for a run started on the default branch, its worktree under `worktree/`. Nothing is written to your checkouts. To discard a run and start over:

```sh
git worktree remove --force .git/openspec-loop/<change>/worktree   # a run started on the default branch
git branch -D loop/<change>                                          # likewise
rm -rf .git/openspec-loop/<change>
```

### Fixture stages

No stage does real work yet. Until later build steps replace them, every stage runs a shell command from a fixture file named by `LOOP_FIXTURE`, and every progress line and report marks the outcome `fixture`:

```yaml
proposal-review: "true"
implementation: "sleep 20"
integration: "true"
archive: "true"
delivery: "true"
```

A command that exits 0 completes its stage; any other exit stops the run as an execution failure. `loop run` and `loop resume` refuse when `LOOP_FIXTURE` is unset or does not name every stage.

## Development

```sh
npm ci      # install the pinned dev dependencies
npm test    # build and run the tests; this is the project's only check
```
