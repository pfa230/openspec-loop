## ADDED Requirements

### Requirement: Supervising several runs

When the user names several changes, the supervision skill SHALL start `loop run` for each of them without waiting for another to end. Each progress line it forwards SHALL name its change. A run that completes, stops or is refused SHALL NOT pause or delay the others. Once every run has ended, the skill SHALL list each change, in the order the user named them, with its outcome.

#### Scenario: Several changes run at once
- **WHEN** the user asks the skill to run `add-a`, `add-b` and `add-c`
- **THEN** the skill starts all three runs without waiting for any to end
- **AND** each progress line it forwards names the change it belongs to

#### Scenario: One run stops while others advance
- **WHEN** the run of `add-b` stops while the runs of `add-a` and `add-c` are advancing
- **THEN** the runs of `add-a` and `add-c` keep advancing, and their progress lines keep reaching the user while the skill handles the stop of `add-b`

#### Scenario: Summary after the last run ends
- **WHEN** the last of the three runs ends
- **THEN** the skill lists `add-a`, `add-b` and `add-c` in that order, each with its outcome: completed, stopped at a named stage, or refused
