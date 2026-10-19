# Design

## Context

See proposal.md for motivation. OpenSpec owns and regenerates the proposing skills and commands. This repository owns `AGENTS.md`, which already defines how agents plan changes and present their results.

## Goals / Non-Goals

Express the reporting preference in the repository's existing agent instructions, independently of the installed OpenSpec version.

## Decisions

Add one bullet in `AGENTS.md` next to the existing planning and presentation rules:

> **Explain proposals.** After completing a proposal, summarize the proposed design and concrete changes in the final response, grounded in the completed artifacts and before the artifact list.

The existing skill supplies artifact creation and the rest of the final response; this rule adds only the missing explanation. Editing generated files loses the preference on refresh. Editing OpenSpec's source would require maintaining an upstream change or fork for a local preference.

## Risks / Trade-offs

- Agents must follow the repository's instructions for the rule to take effect; this is a prose instruction, like the existing reporting rules, rather than CLI enforcement.
