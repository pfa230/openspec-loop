## 1. Worker interface and usage on end lines

- [x] 1.1 Make `startWorker()` append `NNN-<name>.usage.json` as the fourth path, and add `readUsage()` to `src/step.ts` as design.md decision 4 describes. The stub agent in `test/helpers.ts` takes its paths from the last four arguments, and its `Turn` gains `usage`, written as JSON when it is an object and as is when it is a string. Verify with tests: a worker's arguments end with the prompt, schema, reply and usage paths; a reviewer that writes no usage file approves and the run completes; and a usage file that is not JSON, or one with an unknown key stops the run with an execution failure naming the usage problem
- [x] 1.2 Make `work()` read the usage after every exit and return the `(<alias>; <usage>)` tag of design.md decision 5. Use the tag on every worker end line the decision lists, including the execution-failure and user-stop lines. Make the execution-failure cause name the step label and list `Transcript:`, `Reply:` and `Usage:`. Update the existing assertions on end lines and causes, found with `rg -n '\((reviewer|implementer|verifier|reviser)\)|execution failure of' test`. Verify with tests on the end lines of review steps: one that writes tokens and cost reads `input_tokens=9, output_tokens=183, cost $0.069788`; a tokens-only step reads `cost unavailable`; a step without a usage file reads `usage unavailable`; a worker that writes usage and exits 3 shows that usage on its execution-failure line; and the stop cause reads `execution failure of proposalReviewer agent "reviewer" in review 1 of 3: exit status 3`
- [x] 1.3 Update `README.md` to match. The worker interface paragraph names the four paths, the usage file format, and that a missing file means unavailable while a malformed one is an execution failure. A note says custom adapters take their paths from the last four arguments. The progress description says worker end lines carry usage and cost as the harness reports them. Verify by reading the README against design.md decisions 1, 2 and 5

## 2. Adapters

- [x] 2.1 In `src/adapters/common.ts`, make `invocation()` take the last four arguments, and make `runHarness()` take the usage path and an extractor and write the usage file before it judges the exit, as design.md decision 3 describes. Implement each adapter's extractor from the decision's table. Verify with `test/adapters.test.ts`: each recording yields exactly these usage files:
  - Claude: `{"tokens":{"input_tokens":9,"cache_creation_input_tokens":34432,"cache_read_input_tokens":0,"output_tokens":183},"costUsd":0.06978799999999999}`
  - Codex: `{"tokens":{"input_tokens":16641,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":59,"reasoning_output_tokens":21}}`
  - Antigravity: `{"tokens":{"input_tokens":12926,"cache_read_tokens":0,"output_tokens":700,"thinking_tokens":645}}`
  - OpenCode: `{"tokens":{"input":13808,"cache.read":0,"cache.write":0,"output":29,"reasoning":0},"costUsd":0.000111024}`

  Also verify that `STUB_EXIT=5` with each recording still writes that usage file and exits 5, that the existing no-answer test also writes no usage file, and that two OpenCode `step_finish` events sum their tokens and cost
- [x] 2.2 Document in `README.md`'s adapter section, for each adapter, the counters it writes and whether its harness reports a cost. State that counters keep the harness's own names and that a cost is the harness's own figure, as design.md's risks describe. Verify by reading the section against design.md decision 3's table

## 3. Totals by role

- [ ] 3.1 Add `usageTotals()` to `src/controller.ts` as design.md decision 6 describes, and print its block after the locations in both the stopped and the completed report. Verify with a stub-agent test whose configuration sets `attempts.implementation: 1`:
  - **First advancement.** The reviewer approves with usage `{"tokens":{"in":10},"costUsd":0.5}`, the implementer writes `{"tokens":{"in":1},"costUsd":0.25}`, and the verifier returns one blocking finding with `{"tokens":{"in":2}}`. The run stops, and the stopped report's block reads `proposalReviewer: 1 step; in=10, cost $0.5`, `implementer: 1 step; in=1, cost $0.25` and `implementationReviewer: 1 step; in=2, cost unavailable`.
  - **Resume.** Proposal review is complete, so only the implementer and verifier run. The implementer writes `{"tokens":{"in":3}}`, and the verifier approves without a usage file. The completed report's block reads `proposalReviewer: 1 step; in=10, cost $0.5`, `implementer: 2 steps; in=4, cost $0.25, 1 step without cost` and `implementationReviewer: 2 steps, 1 without usage; in=2, cost unavailable`, and has no `planReviser` line
- [ ] 3.2 Document the totals in `README.md`'s description of the report. Verify by reading it against design.md decision 6

## 4. Supervised diagnosis

- [ ] 4.1 Add the "Diagnosing a stop" section to `skills/openspec-loop/SKILL.md` as design.md decision 7 describes. Rework the rule about investigating so that it points to the section and keeps the read-only constraint and the decision-stop exception. Verify by reading the skill against decision 7 and the Supervision skill requirement in the change's spec delta
- [ ] 4.2 Run a real supervised diagnosis in a disposable repository with real OpenSpec and stub agents. Produce two stopped runs:
  - **Infrastructure failure:** an implementer whose command prints `Error: 429 rate limit exceeded` to stdout and exits 1.
  - **Repeated rejection:** a verifier that returns the same blocking finding every time, with `attempts.implementation: 2`.

  For each stop, run one headless `claude -p` session, allowed to read files and run shell commands, with the skill's text as its instructions, asking it to diagnose the stopped run. #9 validates the whole workflow, supervision included, in both Claude and Codex. Verify:
  - Each diagnosis names the likely cause from the report and transcripts: the rate limit, and the repeated finding across both attempts.
  - Each states what evidence is missing or confirms none is, and proposes a recovery.

## 5. Check

- [ ] 5.1 Run `npm test` and verify it passes
