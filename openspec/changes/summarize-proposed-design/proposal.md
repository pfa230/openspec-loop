# Proposal

## Why

The proposing workflow's final response currently requires an artifact inventory and readiness message, but does not require explaining the proposed design or changes. The user wants that explanation at the end of proposing so they can assess the plan directly in the response.

## What Changes

- Require a concise summary of the proposed design and concrete changes in the final response of this repository's native proposing skills and command, grounded in the completed artifacts and presented before the artifact inventory.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a local planning-tool instruction change outside the loop's run behavior; the loop-workflow contract leaves native proposing outside its enforcement. The change sets `skip_specs: true`.

## Impact

- `.agents/skills/openspec-propose/SKILL.md`: Codex output instructions.
- `.claude/skills/openspec-propose/SKILL.md`: Claude skill output instructions.
- `.claude/commands/opsx/propose.md`: Claude command output instructions.

The scope is these checked-in copies. Updating OpenSpec's generator or other repositories is outside this change.
