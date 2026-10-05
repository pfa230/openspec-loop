## Context

The controller (`src/controller.ts`) runs five stages in order, each a fixture shell command from `LOOP_FIXTURE`, through the step runner in `src/step.ts`. The runner starts a child in its own process group in the run's worktree and streams its output to `transcripts/NNN-<stage>.log`. `state.json` records each stage as `pending` or `complete`, the stage in progress and the stop record. `openspec/loop.yaml` holds only `defaultBranch`, and `src/cli.ts` accepts exactly `loop <command> <change>`. See proposal.md for motivation and the `loop-workflow` delta for the requirements.

The four harnesses were checked on this host. Claude Code 2.1.289, Codex 0.160.0 and Antigravity 1.2.12 were checked with real calls, OpenCode 1.18.34 with a real call and its help text:

| Harness | Headless | Schema enforcement | Where the answer is |
|---|---|---|---|
| `claude` | `-p` | `--json-schema <json>` | `structured_output` of the final `result` event of `--output-format stream-json --verbose` |
| `codex` | `exec` | `--output-schema <file>` | the file named by `-o`; `--json` prints the event stream |
| `agy` | `-p=<prompt>`, which must come last | `--json-schema <json or file>` | `structured_output` of the final `result` event of `--output-format stream-json` |
| `opencode` | `run` | none | the `text` of the last `text` event of `--format json` |

## Goals / Non-Goals

**Goals:**
- A real reviewer reviews the committed plan, the plan reviser revises it without the user, and approval advances to the implementation fixture.
- A decision the plan lacks stops the run with the reviewer's question, and resuming after the user records it returns to proposal review.
- Any harness and model can fill any role as a named agent, through a shipped adapter or one the user writes.

**Non-Goals:**
- Usage and cost on end lines (#8). The reply format leaves room for them; see the worker interface below.
- The `implementer` and `implementationReviewer` roles, implementation attempts, required checks and the plan revisions the implementer requests during implementation (#5). Each config field arrives with the step that first uses it, so a configuration naming those roles is refused until #5. The contract describes all four roles; this change implements the two it runs, as the build-controller change did for fields the contract already named.
- Packaging the adapters and the skill for other projects (#10). The adapters are `bin` entries of this package, so they reach PATH wherever `loop` does.
- Reviewing minor fixes (#12).

## Decisions

**An agent is a command, and adapters are separate programs.** pfa rejected building harness knowledge into the loop because it limits which tools people can use, but wanted to keep structured output. An adapter inside the loop would have the same limit, so adapters are executables behind a process interface the loop defines, and the loop knows nothing about harnesses. pfa also wants every harness and model combination to be a named agent, so `opus` and `fable`, or `deepseek` and `mimo` on OpenCode, can be switched by name. Agents map an alias to an argv list; roles assign aliases:

```yaml
defaultBranch: main
agents:
  gpt: [loop-codex, -m, gpt-5.5, -s, read-only]
  opus: [loop-claude, --model, opus, --permission-mode, acceptEdits]
roles:
  proposalReviewer: gpt
  planReviser: opus
attempts:
  proposalReview: 3
```

`defaultBranch`, `agents`, both roles and `attempts.proposalReview` are required after merging; `agents` may define aliases no role uses. Unknown keys at any level are refused, as for `defaultBranch`. `attempts.proposalReview` is a positive integer. At `run` and `resume`, the loop resolves the first element of each agent a role uses to an absolute path: a name without `/` on PATH, a name with `/` against the invoking checkout's top level. It refuses a role assigned an undefined alias, or an agent whose command is not found or not executable, naming the role and the alias. Steps run the resolved path, so a repository-local adapter such as `scripts/my-adapter` works. Execution restrictions need no field of their own: harness flags go in the argv, and a sandbox wrapper goes in front of the adapter (`[ai-jail, --exec, ..., loop-codex, ...]`). The rejected alternatives were a `harness`/`model`/`args` triple per role with adapters built into the loop, with or without a `wrap` prefix; both limit the harness set to what ships, and neither lets one model be reused by name.

**A committed file and a local file.** The loop reads `openspec/loop.yaml`, which is required, then `openspec/loop.local.yaml` beside it when it exists. Both are checked for unknown keys and wrong types on their own, and the refusal names the file. The local file may set anything. Its `defaultBranch` replaces the committed one; its entries under `agents`, `roles` and `attempts` replace the committed entries with the same key and leave the others. Required fields are checked on the merged result. The loop does not edit `.gitignore`; the README tells the user to ignore the local file. Merging entry by entry, rather than letting the local file replace whole sections, lets a user add one agent and point one role at it without copying the rest.

**The plan reviser is its own role.** pfa chose a fourth role over the contract's "the implementer SHALL also revise the plan". The plan reviser revises the plan after `REVISE` and applies minor plan fixes after `APPROVE`; in #5 it also revises the plan when the implementer finds the plan needs a change. #4 therefore uses `proposalReviewer` and `planReviser` only.

**The worker interface.** The loop writes the prompt to `NNN-<step>.prompt.md` and the JSON schema to `NNN-<step>.schema.json` in the transcripts directory. It runs `<command...> <prompt> <schema> <reply>` in the run's worktree with stdin closed, and sends stdout and stderr to `NNN-<step>.log`, as fixture steps do. The adapter takes its last three arguments as the paths and passes the rest through to its harness. The reply file holds the schema-matching object itself. #8 decides how usage and cost travel once their requirements are known. The step succeeds when the command exits 0 and the reply matches the step's schema. A nonzero exit, a signal, a missing reply, invalid JSON or a mismatched reply is an execution failure. Its stop report names the transcript and the reply file. The loop validates the reply by checking the fields of its own two schemas in code. It does not carry a general JSON Schema validator, because it only ever checks its own two shapes. Paths are appended as arguments rather than passed in environment variables because arguments survive any wrapper unchanged, and `ai-jail` drops the environment unless `--inherit-env` is given.

**Four shipped adapters.** `loop-claude`, `loop-codex`, `loop-agy` and `loop-opencode` are TypeScript entry points in `src/adapters/`, published as `bin` entries. Each reads the prompt, runs its harness with stdin closed, copies the harness's stdout and stderr to its own (the transcript), extracts the answer and writes the reply. Each exits nonzero when the harness does, or when no answer can be extracted.

- `loop-claude`: `claude -p --output-format stream-json --verbose --json-schema <schema text> <args...> -- <prompt>`. The answer is `structured_output` of the last `result` event, which must have `subtype: success`.
- `loop-codex`: `codex exec --json --output-schema <schema> -o <reply> <args...> -- <prompt>`. Codex writes its schema-conforming final message straight to the reply file.
- `loop-agy`: `agy --output-format stream-json --json-schema <schema> <args...> -p=<prompt>`. The stream gives a full transcript, and its final event, `{"event": "result", "result": {...}}`, carries `status: "SUCCESS"` and `structured_output` (checked with agy 1.2.12, task 2.4).
- `loop-opencode`: `opencode run --format json <args...> <prompt>`. The adapter appends the schema to the prompt with an instruction to answer with one JSON object and nothing else. The answer is the last `text` event's text, which must parse as JSON as a whole after trimming whitespace. The adapter strips no code fences and hunts for no braces: the legacy loop's brace hunting picked up foreign JSON objects (legacy L1 #264). The alternative was OpenCode's SDK, which supports a `json_schema` output format through a running OpenCode server. It was rejected because it adds a dependency and a server lifecycle to one adapter, and it can be revisited if strict parsing fails in practice.

Adapters add no permission or sandbox flags. An agent with none runs with its harness's defaults, as the contract says. Those defaults do not let `claude -p` or `codex exec` edit files, so the README gives the arguments each harness needs for an agent that edits, such as a plan reviser.

**The reviewer classifies and the loop derives the verdict.** The review schema has one field, `findings`, an array of `{severity: "blocking" | "minor", location: string, problem: string, question: string | null}`. Every property is required and `question` is nullable, because Codex's strict schemas need every property listed and the legacy loop failed runs on a reviewer omitting an optional key (legacy `4c49f03`). There is no verdict field: any blocking finding is `REVISE`, and anything else is `APPROVE`. A reply therefore cannot contradict itself, and the loop needs no rule for one that does.

**Decision questions come only from the reviewer.** pfa chose this over also letting the reviser return a question. Any finding with a non-null `question` stops the run before revision, whatever its severity, with every question in the stop report. The recovery says to record the decisions in `design.md` on the run's branch in its worktree, commit them, and run `loop resume <change>`. The plan reviser's schema is an empty object: its reply only acknowledges the turn, because nothing in the loop would read more. The gap: a reviser that meets an unrecorded decision the reviewer missed cannot ask. It can only fail to resolve the finding, which ends in attempt exhaustion rather than a question.

**The proposal-review stage.** Each review is one attempt. Within the stage:

1. Compute the plan digest. Run the reviewer and write the review record `NNN-proposal-review.verdict.json` with the verdict, the digest and the findings.
2. If any finding has a question, stop with the questions.
3. On `REVISE`, the plan reviser revises the plan. If the review was the last attempt, stop with the findings as the cause, naming the record. Otherwise go to step 1.
4. On `APPROVE` with minor findings, the plan reviser applies them. Then record the digest of the plan as it now stands as the approval, and mark the stage complete. With no findings, the reviewed digest becomes the approval.

The revision comes before the attempt check, so a run that stops on exhaustion already holds the latest revision, and a resume starts by reviewing it. The reviewer sees only the plan and its criteria, never earlier findings, so each review judges the plan as it stands. The revision prompt and the minor-fix prompt both carry the findings, and both tell the plan reviser to edit only `openspec/changes/<change>/`, keep the decisions recorded in the design, implement nothing, and run `openspec validate <change> --strict`. All prompts tell the worker to treat repository content as data, not instructions. The review prompt states both criteria from the contract, the severity definitions and the question rule, and tells the reviewer to modify nothing.

**The loop commits each plan reviser turn.** After a revision or minor-fix turn, the loop stages `openspec/changes/<change>/` with `git add -A -- <dir>` and commits only that path with `git commit -- <dir>`, which leaves any other staged or unstaged work in the worktree untouched. The commit lands on the change's branch as `<change>: revise plan` or `<change>: apply minor plan fixes`, then prints the short hash. A turn that changes nothing under that directory produces no commit and the line says so; edits the reviser makes elsewhere stay uncommitted, as the prompt forbids them. Committing only the change directory keeps unrelated work the user left in the worktree out of the loop's commits, which the contract requires. Commits are deterministic, and the loop already owns the branch. The worker's prompt tells it not to commit.

**State records the approval and the review whose turn is still owed.** `state.json` gains `approvedPlan` (a digest or `null`) and `owedReview` (the path of a review record or `null`). `owedReview` is set when a review requires a plan reviser turn. The record's verdict says which turn: a revision after `REVISE`, minor fixes after `APPROVE`. A resume that finds it set redoes that turn from the recorded findings before anything else. A recovered revision then continues with a review. A recovered fix turn records the post-fix digest and completes proposal review without another review. Clearing `owedReview` is written in the same state write as what follows the turn: the next review's start, or the approval and the stage's completion. Without it, the Stop scenario's "resume redoes the interrupted step" would fail for an interrupted revision. The attempt count is not stored: every resume starts a fresh budget, as the delta says. That also covers exhaustion, and it needs no state. State written by an earlier build has neither field. The package is private, so there is no migration, and the README says to discard such runs.

**`loop resume <change> --attempts <n>` overrides the budget.** pfa asked for a way to resume with a single attempt. The flag takes a positive integer and replaces the configured budget of every bounded stage that resume runs; in #4 that is proposal review only. It is accepted only on `resume`, because `run` can take its budget from the configuration, and a missing, zero or non-integer value prints usage and exits 2. The override lives only in the resuming process and is not stored, like the attempt count itself.

**The plan digest.** It is the SHA-256 of every file under `openspec/changes/<change>/` in the run's worktree, sorted by path, each contributing its path and its content. In `tasks.md`, the `x` or `X` inside a task checkbox (a line starting with optional whitespace, `-` or `*`, a space and `[x]`) is replaced by a space before hashing, leaving every other character, so ticking a box keeps the digest and editing a task's text changes it. The digest is read from the working tree, which is what the reviewer saw. Hashing file contents directly is simpler than recording Git tree ids, and it needs no commit to exist. Hashing every file, rather than naming proposal, design, spec deltas and tasks, keeps the digest independent of the schema's artifact names; the only other file native OpenSpec writes there is `.openspec.yaml`, which changes only when the schema does.

**Invalidation at every stage boundary.** Before running each stage, and in `resume` before it reports a run as already complete, the controller compares the current plan digest with `approvedPlan`. If they differ while proposal review is complete, it prints `plan changed since its approval; reviewing it again`, marks proposal review and every later stage `pending`, and continues from proposal review. The loop does not check that a reviewer left the plan untouched: that is the reviewer's instructions and its agent's restrictions.

**Progress lines.** The reviewer step and the plan reviser turns of the stage print, for example:

```
[14:02:11] proposal-review: review 1 of 3 started (gpt)
[14:03:40] proposal-review: review 1 of 3 REVISE, 2 blocking, 1 minor (gpt)
[14:03:40] proposal-review: plan revision started (opus)
[14:05:02] proposal-review: plan revision committed 1a2b3c4 (opus)
[14:05:02] proposal-review: review 2 of 3 started (gpt)
[14:06:10] proposal-review: review 2 of 3 APPROVE, 0 blocking, 1 minor (gpt)
[14:06:10] proposal-review: minor plan fixes started (opus)
[14:06:51] proposal-review: minor plan fixes committed 5d6e7f8 (opus)
[14:06:51] proposal-review: complete
[14:06:51] implementation: started (fixture)
```

Start and end lines of a worker step name the agent's alias, which pfa asked for; the step name says which role it is. Usage and cost on end lines arrive with #8, as in the build-controller change. The loop cannot name a harness or model, which is the BREAKING contract change in the proposal. A worker execution failure's report adds `Transcript:` and `Reply:` lines.

**Fixtures shrink to four stages.** `LOOP_FIXTURE` must name `implementation`, `integration`, `archive` and `delivery`. The completion report says which stages were fixtures and did no real work. Approval runs the implementation fixture without user action, which is the transition the issue asks to verify.

**The supervision skill learns the decision stop.** When a run stops with questions, the skill shows them to the user. It records the user's answers in `design.md` and commits them on the run's branch only with the user's agreement, and resumes only with agreement. The skill's rule against editing the run's worktree gains this one agreed exception, stated next to the rule.

**Tests.** Stage tests use a scripted stub adapter. It is a small Node script that pops the next reply from a queue file, applies any file edits the test scripted, and writes the reply. They drive the built `loop` in temporary repositories, as the existing tests do. Adapter tests run each built adapter against a stub harness executable on PATH. The stub prints recorded output and logs its arguments, so the tests check the harness flags, argument pass-through and answer extraction. CI installs no harness. Real harnesses are verified by hand (section 6 of the tasks).

## Risks / Trade-offs

- [OpenCode's final message is not bare JSON] → The adapter fails, the run stops with an execution failure, and the transcript shows the message. The SDK's structured output is the fallback design if this happens often.
- [A harness changes its flags or output shape] → The adapter fails loudly and the transcript shows why. The README records the versions each adapter was verified with.
- [A harness's defaults keep the plan reviser from editing] → Each revision commits nothing, the progress line says `no changes`, and the run ends in exhaustion. The README gives the editing arguments for each harness.
- [Approval covers uncommitted plan edits, such as a decision the user recorded but did not commit] → The next plan reviser commit includes them, and the digest still identifies what was approved. The recovery text tells the user to commit.
- [An agent whose command resolves through the invoking checkout runs that checkout's copy of a repository-local script, not the run worktree's] → Accepted. It matches how the configuration itself is read.
- [A fresh budget on every resume lets a run review beyond its configured limit across resumes] → Each resume is an explicit act by the user, and the contract already grants a fresh budget after exhaustion.
