## ADDED Requirements

### Requirement: Supervising several runs

When the user names several changes, the supervision skill SHALL first read each change's plan and flag each change that needs work the default branch does not yet hold, such as another named change, with the evidence. It SHALL start runs only when the invoking checkout is on the configured default branch; on any other branch it SHALL name that branch and the default branch and start no run. When it flags any change, it SHALL propose dropping it and start no run until the user confirms which changes to run. It SHALL start `loop run` for each change to run without waiting for another to end. Each progress line it forwards SHALL name its change. A run that completes, stops or is refused SHALL NOT pause or delay the others. Once every run has ended, the skill SHALL list each change it ran, in the order the user named them, with its outcome.

#### Scenario: Change that needs unlanded work
- **WHEN** the user names `add-a`, `add-b` and `add-c`, and the plan of `add-b` relies on a requirement that `add-a` adds and the default branch does not hold
- **THEN** the skill names `add-b`, cites `add-a` and the plan text that shows the dependency, proposes dropping `add-b`, and starts no run until the user confirms
- **AND** once the user confirms dropping `add-b`, it starts `add-a` and `add-c`

#### Scenario: Batch from another branch
- **WHEN** the user names `add-a` and `add-b` from a checkout on branch `work` while the default branch is `main`
- **THEN** the skill names `work` and `main` and starts no run

#### Scenario: Several changes run at once
- **WHEN** the user asks the skill to run `add-a`, `add-b` and `add-c` from a checkout on the default branch
- **THEN** the skill starts all three runs without waiting for any to end
- **AND** each progress line it forwards names the change it belongs to

#### Scenario: One run stops while others advance
- **WHEN** the run of `add-b` stops while the runs of `add-a` and `add-c` are advancing
- **THEN** the runs of `add-a` and `add-c` keep advancing, and their progress lines keep reaching the user while the skill handles the stop of `add-b`

#### Scenario: Summary after the last run ends
- **WHEN** the last of the three runs ends
- **THEN** the skill lists `add-a`, `add-b` and `add-c` in that order, each with its outcome: completed, stopped at a named stage, or refused
