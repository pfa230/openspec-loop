# Design

## Context

See `proposal.md` for the problem. The bundled `skills/openspec-loop/SKILL.md` already requires unchanged report relay and verbatim questions, but its decision-stop section emphasizes that only the user can answer and separately offers recording and resuming. It does not require an explanation, recommendation or self-contained decision request.

The `.agents/skills/openspec-loop/SKILL.md` and `.claude/skills/openspec-loop/SKILL.md` copies currently match the bundle. `test/setup.test.ts` already checks installation and refresh against bundled file contents. The existing Supervision skill and Autonomous plan revision requirements keep decision authority with the user and continuation subject to agreement.

## Goals / Non-Goals

**Goals:** Implement the decision-stop handoff in the Supervision skill delta using the existing conversation and report, with no new runtime mechanism.

**Non-Goals:** Change decision detection, reviewer behavior, report formatting, CLI commands, controller progression, run state, successful stage boundaries or execution-failure diagnosis. This change does not authorize the supervisor to decide for the user.

## Decisions

### Use one self-contained conversational handoff

Keep the unchanged report relay, then present all questions together in ordinary user-facing prose. Number and quote each question verbatim; underneath, explain the practical decision, relevant choices and tradeoff, and a recommended answer with its reason. Explicitly permit targeted reads of the change's planning artifacts and associated review findings to ground that advice within the read-only diagnosis rules. If they cannot support a recommendation, identify the missing evidence.

Close with a concrete reply instruction such as: `Reply with your choices for 1 and 2, or say "use both recommendations".` Include the proposed recovery actions when seeking authorization for them. A report dump or a reference to questions "above" cannot stand in for this request. A copy-only handoff would preserve the original failure to help the user decide; an interactive form, new command or structured decision store adds machinery the existing conversation does not need.

### Separate advice from authority, reuse consent

Replace the ambiguous prohibition on supplying answers with explicit permission to recommend and an explicit requirement for the user to answer or approve before decisions are recorded. Keep the run stopped while waiting. Once the user has approved answers, use any authorization already given to write them to `design.md` in the reported run worktree, commit on its branch and resume through the existing workflow. Request missing authorization together instead of creating separate recording and resuming round trips. Answering a question alone does not authorize continuation.

Automatically adopting recommendations would change the existing user-decision contract. Always asking again after an explicit instruction to record, commit and resume creates avoidable work for the user. Existing session authorization is sufficient; no additional flags or state are needed.

### Update the bundle and existing installed copies together

Make the bundled skill authoritative, refresh only its two tracked project copies to match, and update the README supervision paragraph to explain the new handoff. Changing only the `.agents` copy would lose the fix on the next setup refresh and leave Claude users behind. No installer changes are needed.

### Validate prose behavior directly

Review a two-question example against the spec scenarios, including supported recommendations, insufficient evidence, approval with complete recovery authorization, and answers without it. Check exact quotation and that the user can reply without reading tool output. Use the existing setup tests through the required `npm test`; do not add tests that merely assert wording or a new model-evaluation harness. These checks validate the instructions and distribution, not guaranteed model compliance in every session.

## Risks / Trade-offs

- Recommendations may be mistaken for decisions. Mitigation: label them as advice and wait for user answers or explicit approval before recording anything.
- Repeating questions after the unchanged report adds some text. Mitigation: keep explanations concise; the repetition makes the required user action visible without searching raw output.
- Skill instructions cannot guarantee agent compliance. Mitigation: use direct imperatives, a short reply example and scenario-based manual review.
