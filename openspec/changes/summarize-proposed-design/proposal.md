# Proposal

## Why

The proposing workflow's final response currently requires an artifact inventory and readiness message, but does not require explaining the proposed design or changes. The user wants that explanation at the end of proposing so they can assess the plan directly in the response.

## What Changes

- Add a repository-owned instruction in `AGENTS.md` requiring proposing workflows to finish with a concise summary of the proposed design and concrete changes, grounded in the completed artifacts and presented before the artifact inventory.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This changes how agents report attended planning work, outside the loop's run behavior. The change retains `skip_specs: true`.

## Impact

- This repository's `AGENTS.md`, alongside its existing planning and presentation rules.

OpenSpec source, installed package files and generated skills/commands remain untouched. The instruction applies to agents working in this repository.
