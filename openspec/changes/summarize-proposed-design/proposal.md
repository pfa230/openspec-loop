# Proposal

## Why

The proposing workflow's final response currently requires an artifact inventory and readiness message, but does not require explaining the proposed design or changes. The user wants that explanation at the end of proposing so they can assess the plan directly in the response.

## What Changes

- Require a concise summary of the proposed design and concrete changes in OpenSpec's source templates for the proposing skill and command, grounded in the completed artifacts and presented before the artifact inventory. Native generation and `openspec update` will carry this instruction into project files.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None in openspec-loop. The target is OpenSpec's planning-tool instructions, outside the loop's run behavior, so this planning change retains `skip_specs: true`. OpenSpec's own specification requirements must be reconciled in its source checkout before implementation.

## Impact

- OpenSpec's source module defining `getOpsxProposeSkillTemplate()` and `getOpsxProposeCommandTemplate()`, observed in the installed package as `dist/core/templates/workflows/propose.js`.
- Generated proposing skills and commands receive the new instruction through the existing generator, including Codex and Claude installations.

Implementation belongs in the OpenSpec source repository. This openspec-loop worktree holds the corrected plan for review, not an executable loop change for this repository. No OpenSpec source checkout was found in the inspected project and repository directories; installed package code supplied the implementation evidence.
