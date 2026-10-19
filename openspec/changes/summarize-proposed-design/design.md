# Design

## Context

See proposal.md for motivation and scope. The three native proposing entrypoints each have an `Output` section requiring an artifact inventory and readiness message. They are checked-in OpenSpec-generated instructions, separate from the loop's bundled skills.

## Goals / Non-Goals

Use the existing final-response instructions; no new artifact or output format is needed.

## Decisions

Add the same bullet immediately after the change name and location in each entrypoint's `Output` section:

> A concise summary of the proposed design and concrete changes, grounded in the completed artifacts and placed before the artifact list.

This directly supplies the missing review information in the existing response. Adding another document or relying on artifact filenames would leave the user opening files to learn the plan. Use the completed artifacts as the source so the summary also works when an optional design document is absent.

## Risks / Trade-offs

- OpenSpec regeneration may overwrite these local instructions. This change deliberately updates the checked-in copies; persistence in the upstream generator requires separate work.
