## Why

Every stage of a run is still a fixture, so nothing reviews a plan yet. This change makes proposal review real. A configured reviewer judges the committed plan. A plan reviser revises it without the user until it is approved. The run stops with a question only when the plan lacks a decision. Steps 1 to 4 together are the first milestone: attended native proposing, then real, autonomous review and revision.

Roles must work with Claude Code, Codex, Antigravity (`agy`) and OpenCode from the start, without limiting the loop to those four. Each harness and model combination must be one named agent that the user defines, so `opus` and `fable`, or `deepseek` and `mimo` on OpenCode, are separate choices. The loop therefore talks to every worker through one interface, and ships an adapter for each harness.

## What Changes

- Add a worker interface. An agent is a command. The loop appends three paths to it: the prompt, a JSON schema and the reply file. The command's output is the step's transcript. The command must write a reply holding an object that matches the schema. A missing or malformed reply is an execution failure.
- Ship four adapters as package commands: `loop-claude`, `loop-codex`, `loop-agy` and `loop-opencode`. Each runs its harness headless, passes the agent's own arguments through, and converts the harness's output into the standard reply. Claude Code, Codex and Antigravity enforce the schema natively. OpenCode has no schema flag, so its adapter asks for JSON in the prompt and parses the final message strictly.
- Configuration gains `agents`, which maps each alias to its command, and `roles`, which assigns an alias to each role. It also gains `attempts.proposalReview`, a positive integer. This change uses two roles: `proposalReviewer` and `planReviser`. Execution restrictions are part of an agent's command, either as harness flags or as a wrapper such as `ai-jail`. The implementer, the implementation reviewer, implementation attempts and required checks arrive with #5.
- Read an optional, gitignored `openspec/loop.local.yaml` beside the committed `openspec/loop.yaml`. A value the local file sets replaces the committed one, entry by entry.
- Make the plan reviser a role of its own, separate from the implementer. It revises the plan and applies minor plan fixes.
- Make the `proposal-review` stage real.
  - The reviewer receives the change's planning artifacts. It returns findings, each blocking or minor, and each carrying a question when resolving it needs a decision the plan does not record.
  - The loop derives the verdict: any blocking finding means `REVISE`.
  - On `REVISE`, the plan reviser revises the plan in a fresh context, and the plan is reviewed again within the attempt limit.
  - On `APPROVE` with minor findings, the plan reviser applies them and no further review follows.
  - Any finding with a question stops the run with that question.
- Commit each plan reviser turn on the change's branch.
- Record each review's verdict, findings and plan digest. The digest covers every file of the change except task completion marks. Ticking a task box keeps the approval, and editing a task's text voids it. At every stage boundary and on every resume, a plan that no longer matches its approval makes proposal review and every later stage incomplete.
- Grant a fresh attempt budget on every resume. Add `loop resume <change> --attempts <n>`, which replaces the configured budget for that resume.
- Keep `implementation`, `integration`, `archive` and `delivery` as `LOOP_FIXTURE` stages. Approval advances to the implementation fixture automatically. The completion report names the stages that were fixtures.
- Teach the supervision skill the decision stop: show the questions, then, with the user's agreement, record the answers on the run's branch and resume.
- **BREAKING** (contract): a worker step's progress lines name the agent's alias, not "the role's harness and model". The loop no longer knows which harness or model an agent runs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`:
  - Adds Worker interface and Shipped adapters.
  - Independent roles: defines agents as aliased commands, and makes the plan reviser a fourth role.
  - Execution restrictions: places restrictions in an agent's command.
  - Reviews and verdicts: derives the verdict from the findings, and gives minor plan fixes to the plan reviser.
  - Autonomous plan revision: gives revision to the plan reviser, and says how a reviewer raises a decision question.
  - Bounded attempts and execution failures: counts a missing or malformed reply as an execution failure, grants a fresh budget on every resume, and adds the resume override.
  - Progress and usage reporting: names the agent's alias.
  - Loop configuration: adds the local file.

## Impact

- New code in `src/`:
  - configuration of agents, roles, attempts and the local file
  - the worker interface
  - prompts and reply schemas
  - the plan digest
  - the proposal-review stage
- New adapter entry points in `src/adapters/`, published as `bin` entries.
- `src/cli.ts` accepts `--attempts <n>` on `resume`.
- `src/controller.ts` runs a real stage alongside fixture stages, and `src/fixture.ts` stops naming `proposal-review`.
- `state.json` gains:
  - the approved plan digest
  - the plan reviser turn still owed after the last review

  Review records and reply files are kept in the run's transcripts directory.
- Testing:
  - Stage tests use scripted stub adapters.
  - Each adapter is tested against a stub harness executable.
  - CI installs no harness.
- `README.md` documents:
  - agents, roles and the local file
  - the adapters
  - the worker interface for custom adapters
  - what each harness needs before it can edit
  - the resume override
- `skills/openspec-loop/SKILL.md` gains the decision stop.
