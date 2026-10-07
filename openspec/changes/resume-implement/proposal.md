## Why

Once a run's implementation is complete, the user cannot send it back to the implementer after editing the plan by hand (#31). `loop resume` continues from the first incomplete stage and never repeats a complete one, and implementation reopens only when integration or a reported plan problem reopens it. Discarding the run is the only route left, and it also removes the run's worktree, branch and transcripts. The accidental route through integration's patch comparison closed with `review-patch-without-plan` (#27).

## What Changes

- **`loop resume <change> --implement`.** Before advancing, the resume makes implementation and every later stage incomplete. The next round implements the plan as it stands on the run's branch, starting from the work already there, then runs the checks, implementation review, integration, archival and delivery as usual. The flag combines with `--attempts <n>`.
- **No plan review for the edit.** The user made the edit, so verifying it is the user's job. When proposal review is still incomplete, the run reviews the plan first anyway, as any resume does, so the flag cannot skip a review.
- **Refused once the change is archived.** After archival the change has left `openspec/changes/<change>/`, so there is no plan to implement. `loop resume --implement` refuses and leaves the run as it was.
- **The loop does not detect plan edits.** Nothing new is stored in the run's state; the user decides when to send a run back.
- **Docs.** The README's command table and proposal-review section, and the supervision skill's command list and recoveries, name the flag. The skill offers it, with the user's agreement, when the user has edited the plan of a run whose implementation is complete.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Run control gains the `--implement` clause and its scenarios.

## Impact

- `src/cli.ts`: `resume` accepts `--implement` beside `--attempts <n>`, in either order; the usage line names it.
- `src/commands.ts`: `resume()` refuses `--implement` on an archived change and otherwise marks implementation and every later stage pending before `advance()`.
- Tests: the CLI argument test, and stage tests for a reopened implementation, a run stopped at proposal review, and the refusal after archival.
- `README.md`, `skills/openspec-loop/SKILL.md`.
