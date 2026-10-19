## Why

The supervision skill currently tells the supervising agent to resume an edited plan at the stopped stage or with `--implement`, both of which preserve completed proposal approval. A supervisor that changes the plan must send it through proposal review again; the loop should provide the explicit command without detecting plan changes itself.

## What Changes

- Add `loop resume <change> --review` to reopen proposal review and every later stage before archival, retaining the branch's existing work.
- Require the supervising agent to use `--review` when continuing the run after its plan edits.
- Update the supervision skill and README to describe this recovery, preserving plain resume and `--implement` for their existing uses.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Explicit proposal-review restart and the supervising agent's responsibility to invoke it after editing a plan.

## Impact

CLI parsing and resume preparation in `src/cli.ts` and `src/commands.ts`; the existing plan-reopening path in `src/controller.ts`; related CLI and stage tests; `skills/openspec-loop/SKILL.md` and README recovery guidance. No new dependencies or persisted state fields.
