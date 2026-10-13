# Proposal

## Why

Both reviewers judge a closed list of criteria, so a repository's own rules for its work can never produce a finding. A repository whose AGENTS.md demands minimal designs still gets plans and patches approved that break that rule, and a criterion that only asks whether the plan can be verified without the user pushes revisions toward more machinery, with nothing pushing back.

## What Changes

- Proposal review also judges whether the plan follows the rules the repository's instructions for agents set for what a change contains.
- Implementation review judges the patch against the same rules.
- A finding that a plan or patch breaks such a rule is blocking, like a failure of any other review criterion.
- Rules about how an agent works or reports, rather than what the change contains, are not review criteria.
- A repository with no instructions for agents is reviewed as before.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Reviews and verdicts, and Implementation cycle, add the repository's rules for change content to the proposal and implementation review criteria.

## Impact

`src/prompts.ts` (both review prompts and the shared finding rules), a test of the review prompts, and the README's description of both reviews. No configuration, schema, state, adapter or verdict format changes.
