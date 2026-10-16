# Proposal

Source issue: https://github.com/pfa230/openspec-loop/issues/13

## Why

`loop run <change>` runs one proposed change unattended, so a batch of proposed changes still needs a person to start and watch each one. The loop already keeps runs of different changes apart, each in its own worktree with its own state, so several changes can run at once; what is missing is a supervisor that starts them together, keeps their output apart and reports on all of them.

## What Changes

- Before starting, the skill reads each named change's plan, flags changes that need work not yet on the default branch, including another named change, and proposes dropping them. Runs start once the user confirms the list; if nothing is flagged, they start immediately.
- The `openspec-loop` supervision skill accepts several named changes. It starts `loop run` for each of them at once, so each runs in its own worktree, and supervises all of them in one session.
- Each relayed progress line names its change, since the loop's progress lines do not.
- A run that stops, is refused or completes does not hold up the others. The skill shows that run's report and handles it as it does a single run, while the others keep advancing.
- When every run has ended, the skill gives one summary listing each change it ran, in the order the user named them, with its outcome.
- The README's supervision section says the skill can supervise several changes at once.

## Non-goals

- No new `loop` command, option or run state: the batch lives in the supervising session, and each change remains an ordinary run.
- No dependency tree. The skill checks each named change for direct dependencies on unlanded work. It does not trace further, order changes, or run a dependent after its prerequisite lands.
- No limit on how many runs advance at once, and no automatic resume or skip logic.
- No change to merge-mode integration or delivery. Two parallel runs that deliver to the same default branch can collide, and the later one then stops with the existing cause and recovery.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: a new requirement for the supervision skill supervising several runs at once.

## Impact

- `skills/openspec-loop/SKILL.md`: a new section on supervising several changes in Claude Code and Codex.
- `README.md`: the supervision section.
- No source code, configuration or CLI changes.
