# Spec Delta

## ADDED Requirements

### Requirement: JSON run status

`loop status <change> --json` SHALL print one JSON object followed by a newline, with exactly `version` (number 1), `status` (`advancing`, `stopped`, `between-stages`, `interrupted`, or `complete`, matching ordinary status), `branch` and `worktree` (recorded strings), and `report` (ordinary status text for that observation). The flag SHALL change successful output only; refusals SHALL retain exit 2 and stderr diagnostics with empty stdout.

#### Scenario: Host inspects a decision stop
- **WHEN** a host queries `loop status <change> --json` for a run stopped with a decision question
- **THEN** stdout contains only the version 1 JSON response with `status` equal to `stopped`, the run's branch and worktree, and the ordinary status report including the question and recovery
