## Context

See proposal.md for the motivation. The relevant current state:

- **Worker steps.** `startWorker()` in `src/step.ts` writes `NNN-<name>.prompt.md` and `.schema.json` under the run's `transcripts/` directory. It then runs the agent's command with the prompt, schema and reply paths appended, sending the command's output to `NNN-<name>.log`. `work()` in `src/controller.ts` prints the start line and the execution-failure and user-stop end lines itself. It returns the checked reply, and its callers print every other end line, each ending in `(<alias>)`.
- **Worker step names.** Six names map to the four roles:

  | Step name | Role |
  |---|---|
  | `proposal-review` | `proposalReviewer` |
  | `plan-revision`, `plan-fixes` | `planReviser` |
  | `implementation`, `implementation-fixes` | `implementer` |
  | `implementation-review` | `implementationReviewer` |

  No other step writes a `.prompt.md`.
- **Adapters.** `invocation()` in `src/adapters/common.ts` takes the last three arguments as the paths. `runHarness()` copies the harness's stdout to the transcript and exits with the harness's status when it fails, before the adapter sees the output.
- **What the recorded harness streams report** (`test/recordings/`):

  | Harness | Usage | Cost |
  |---|---|---|
  | Claude Code | The `result` event's `usage`: `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` and `output_tokens`, plus nested breakdowns | `total_cost_usd` |
  | Codex | Each `turn.completed` event's `usage`: `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens` and `reasoning_output_tokens` | None |
  | Antigravity | The `result` event's `result.usage`: `input_tokens`, `output_tokens`, `thinking_tokens`, `cache_read_tokens` and `total_tokens` | None |
  | OpenCode | Each `step_finish` event's `part.tokens`: `input`, `output`, `reasoning`, `cache.read`, `cache.write` and `total`. OpenCode reports these per model step, not per run. | Each `step_finish` event's `part.cost` |

- **Reports.** `stop()` and the completion branch of `advance()` print the report, which ends with the worktree, run directory and transcripts lines from `locations()`.
- **The supervision skill.** `skills/openspec-loop/SKILL.md` relays progress and reports, and answers decision stops. Its rules forbid changing anything while investigating, but it gives no method for diagnosing a stop.

## Goals / Non-Goals

**Goals:**

- Each worker step's usage travels through one explicit file, and the loop never interprets a harness's stream.
- Totals cover every worker step the run has ever had without a new state field.
- The skill's diagnosis is read-only and works the same in Claude and Codex.

**Non-Goals:**

- Normalizing counters across harnesses, such as folding cache reads into input.
- Usage for steps that are not worker turns.

## Decisions

### 1. Usage travels in a fourth appended path

The loop appends `NNN-<name>.usage.json` after the reply path. Writing it is optional for the worker.

Rejected alternatives:

- **A marker line in the transcript.** This needs no interface change, but it is in-band signaling in a log the harness also writes, and the loop would parse free-form output.
- **An environment variable naming the file.** Sandbox wrappers such as `ai-jail` may filter the environment; arguments pass through any wrapper.
- **A usage key in the reply.** The reply is the model's schema-checked answer. Adding adapter metadata to it would mean editing the schema the harness enforces.
- **The loop parsing each harness's stream.** An agent's command is opaque and may be wrapped, so the loop cannot know which harness ran. The adapter knows.

The change breaks custom adapters that take the last three arguments as their paths. The project has no release yet (#10), so the change carries no compatibility shim.

### 2. The usage file format

The usage file holds a JSON object with two optional keys:

```json
{ "tokens": { "input_tokens": 9, "cache_creation_input_tokens": 34432, "cache_read_input_tokens": 0, "output_tokens": 183 }, "costUsd": 0.069788 }
```

- **`tokens`** maps a counter name to a non-negative finite number.
- **`costUsd`** is a non-negative finite number.
- **Any other key**, or a value of another type, makes the file malformed.
- **An object with neither key** reports nothing, the same as no file.

Counter names are the harness's own field names, with nested fields joined by a dot (`cache.read`). The loop treats names as opaque labels. It prints them as given and sums them by name. Translating them into a shared vocabulary such as `input` or `cached` would claim that two harnesses' counters mean the same thing, and they do not. Claude Code's `input_tokens` excludes cache reads; Codex's `input_tokens` includes its `cached_input_tokens`.

### 3. What each adapter writes

Each adapter writes these counters when the harness reports them, and omits any it does not:

| Adapter | `tokens` | `costUsd` |
|---|---|---|
| `loop-claude` | From the last `result` event's `usage`: `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens` | `total_cost_usd` of that event |
| `loop-codex` | From the last `turn.completed` event's `usage`: `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens` | None |
| `loop-agy` | From the last `result` event's `result.usage`: `input_tokens`, `cache_read_tokens`, `output_tokens`, `thinking_tokens` | None |
| `loop-opencode` | The sum over every `step_finish` event's `part.tokens` of `input`, `cache.read`, `cache.write`, `output`, `reasoning` | The sum of `part.cost` over the same events |

- **Harness totals are left out**, such as Antigravity's `total_tokens` and OpenCode's `total`. Each is a sum of counters the file already carries.
- **The lists are explicit.** Copying every numeric field would pull in Claude Code's nested cache and iteration breakdowns, which repeat the top-level counters.
- **OpenCode's sum is not an estimate.** OpenCode reports usage and cost per model step, so the run's usage is the sum of its steps.
- **Nothing reported means no file.** When a stream has no usage event, the adapter writes no usage file.

`runHarness(command, args, usagePath, usageOf)` gains the usage path and an extractor from the harness's stdout to the usage object or `undefined`. After the harness exits, it writes the usage file when the extractor returns something, and only then judges the exit status. A failed turn that reported usage, such as a Claude Code `result` event with an error subtype, therefore keeps its usage. `invocation()` takes the last four arguments.

### 4. How the loop reads usage

`readUsage(path)` in `src/step.ts` returns one of three results:

- **No file:** no usage.
- **A valid object:** the usage.
- **Anything else:** the problem `the usage file is not JSON` or `the usage file does not match the usage format`.

`work()` reads the usage after the worker exits, whatever its status:

- **Exit 0, a valid reply and malformed usage** is an execution failure whose problem is the usage problem.
- **A failed exit or a bad reply** is reported by its own problem alone. A malformed usage file on such a step shows as `usage unavailable`, and the adapter's bug surfaces on its next successful turn.
- **Well-formed usage** appears on the end line in every case, including a user stop.

### 5. End line and execution-failure format

A worker step's alias suffix becomes `(<alias>; <usage>)`, where `<usage>` is one of these:

- **Tokens and cost:** `input_tokens=9, cache_creation_input_tokens=34432, cache_read_input_tokens=0, output_tokens=183, cost $0.06978799999999999`
- **Tokens only:** `input_tokens=16641, cached_input_tokens=0, output_tokens=59, reasoning_output_tokens=21, cost unavailable`
- **Cost only:** `tokens unavailable, cost $0.0001`
- **No usage:** `usage unavailable`

Counters keep the file's key order, and every number prints as JavaScript prints the parsed value, without rounding. The figures are exactly what the harness reported, including Claude Code's float noise.

`work()` returns `{ value, tag }` with the suffix. Every caller that ends a worker step uses `tag` where it used `(${alias})` before. That covers the verdict lines, the `committed` and `made no changes` lines of the reviser and implementer turns, and the `changed the plan` line. A second line after the step ends, such as `implementer reports the plan needs a change`, keeps the bare `(<alias>)`.

The execution-failure cause names the step label and lists all three worker files:

```
Cause: execution failure of implementer agent "opus" in attempt 2 of 3, implementer: exit status 1
Transcript: …/005-implementation.log
Reply: …/005-implementation.reply.json
Usage: …/005-implementation.usage.json
```

The usage path appears every time, not only for a usage problem, so that the report keeps a single shape.

### 6. Totals are computed from the transcripts directory

At report time, `usageTotals(dir)` walks `transcripts/`:

- **Steps.** Every `NNN-<name>.prompt.md` is one worker step.
- **Roles.** The table in Context maps the name to a role.
- **Usage.** `readUsage()` reads the step's `.usage.json`. A missing or malformed file counts as a step without usage.

For each role, the totals hold:

- the number of steps
- the number without usage
- the sum of each counter by name
- the number of steps with a cost, and the summed cost

The report prints them after the locations lines:

```
Usage by role:
  proposalReviewer: 2 steps; input_tokens=33282, cached_input_tokens=0, output_tokens=118, reasoning_output_tokens=42, cost unavailable
  implementer: 3 steps, 1 without usage; input_tokens=27, cache_creation_input_tokens=90210, cache_read_input_tokens=401177, output_tokens=5120, cost $1.2034117, 1 step without cost
```

- **Roles** appear in the fixed order proposal reviewer, plan reviser, implementer, implementation reviewer, and only when they have steps. A run with no worker steps prints no block.
- **Cost.** `, N steps without cost` follows the cost only when some of the role's steps reported a cost and others did not. When none did, the cost reads `cost unavailable`.
- **Tokens.** When no step reported tokens, the line reads `tokens unavailable`.

Rejected alternative: a running total in `state.json`. It would need a new field, an update in every worker path, and a migration for runs already in progress, and it would miss a step whose process died before the update. The files are already on disk for every advancement, and the walk sees them all.

### 7. The skill's diagnosis

A new section of `skills/openspec-loop/SKILL.md`, "Diagnosing a stop", replaces the current one-line rule about investigating. It applies to Claude and Codex alike, because it uses only reads: the report, `loop status`, `cat`, `tail` and `jq` on the run's files, and `git log` and `git diff` in the run's worktree. It works through these steps:

1. **Classify the stop from the report's cause.**
   - A user stop needs no diagnosis.
   - A decision stop is handled by the existing section.
   - Integration and delivery preconditions, such as a dirty checkout or a diverged or rejected branch, carry their own recovery; the skill explains it.
   - That leaves the two cases this section diagnoses: execution failures and exhausted attempts.
2. **Execution failure.** Read the end of the named transcript, the reply file if it exists, and the end line's usage.
   - **Likely causes** to name, citing the lines that show them: authentication, quota or rate limit (`401`, `402`, `429`), network, a harness permission denial, a turn limit, a missing command, or a reply that does not match the schema.
   - **Evidence gaps.** When the transcript ends without an error, such as on a signal, an empty log, or no usage, say what is missing instead of guessing.
   - **Other failures.** A failure of `git` or `gh` quotes the command's output in the cause. An `openspec archive` refusal names only its transcript, which holds OpenSpec's explanation, so read it. An execution failure of the loop itself has no transcript; its cause is the whole evidence, and the skill says so.
3. **Exhausted attempts.** List the run's `*.verdict.json` and `*.findings.json` records in step order and compare their findings across attempts. Use the patterns below, and diff consecutive reviewed candidates by the `commit` fields of the implementation review records. For proposal review, diff the `<change>: revise plan` commits.

   | Pattern across attempts | Likely cause |
   |---|---|
   | The same finding repeats | The implementer or reviser does not address it, or cannot within the plan |
   | Findings change every attempt | The reviewer moves the goalposts, or each fix breaks something new |
   | The same check failure repeats unchanged | It may also fail on the base, which the implementer must not repair. The user can check the base. |

4. **Present and wait.** Give the likely cause with the file and line evidence, the gaps, and the recoveries the situation allows:
   - `loop resume` after fixing the environment
   - `loop resume --attempts <n>`
   - a recorded decision or plan edit, committed and then resumed
   - discarding the run

   Then wait. The skill repairs or resumes only when the user agrees.

### 8. No separate stop-report change for repeated rejection

An exhausted-attempts stop already names the stage, the count and verdict or failed checks, and the last review or findings record. The record shares its step's base path with the step's transcript, and the report prints the transcripts directory. Decision 5 changes only execution failures, whose cause did not name the step.

## Risks / Trade-offs

- **[A role whose agent changes between advancements sums counters of two harnesses under one name]** → Counters keep the harness's own names, so they collide only when two harnesses use the same name. The README states that totals sum counters by name.
- **[A harness's cost is its own figure]** → OpenCode prices from its model table and reports `0` for a model without pricing. Claude Code reports list price even under a subscription. The loop shows the figure as reported and does not correct it, and the README says so.
- **[OpenCode can exit before its final `step_finish` event]** (opencode#26855) → The usage then undercounts. It is still what the harness reported, and the transcript shows the missing event.
- **[A harness renames a counter in a new version]** → The adapter then omits the counter, and the line shows fewer counters or `usage unavailable`. Nothing reads as zero. The README's adapter table records the harness versions the counters were verified with.

## Migration Plan

Runs already in progress keep working. Their earlier steps have no usage file and count as steps without usage in the totals. Custom adapters must take their paths from the last four arguments.
