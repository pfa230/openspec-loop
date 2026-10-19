# Design

## Context

See proposal.md for motivation and target. The installed OpenSpec package defines separate skill and command templates in `dist/core/templates/workflows/propose.js`. Both have an `Output` section requiring an artifact inventory and readiness message. OpenSpec's update code generates project files from those templates and writes over existing content.

## Goals / Non-Goals

Change the source of the generated instructions so regeneration retains the summary requirement. Use the existing final-response format.

## Decisions

In the OpenSpec source module defining `getOpsxProposeSkillTemplate()` and `getOpsxProposeCommandTemplate()`, add the same bullet immediately after the change name and location in each template's `Output` section:

> A concise summary of the proposed design and concrete changes, grounded in the completed artifacts and placed before the artifact list.

Use the existing generation and update paths to distribute the instruction. Hand-editing generated project files or the installed package would lose the correction on a later refresh or package upgrade. No override mechanism is needed.

Implement in an OpenSpec source worktree after reconciling this plan with that repository's instructions and specs. Do not run this plan through openspec-loop in the current repository: its implementation target is elsewhere.

## Risks / Trade-offs

- The installed distribution establishes the two template functions and generation behavior, but the source checkout and its tests were unavailable for inspection. Exact source and test paths must be confirmed in that checkout before implementation; this plan does not claim readiness for an unattended run here.
