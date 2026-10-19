# Design

## Context

See `proposal.md` for the reported problem. Current `main` provides `skills/loop-propose/SKILL.md`, which loads and follows native OpenSpec proposing before summarizing its artifacts. Its first step leaves clarification to native proposing without requiring context, tradeoffs or recommendations. `skills/loop-scope/SKILL.md` already invokes this wrapper. The existing supervision guidance concerns decision stops after enrollment rather than questions during proposing.

## Goals / Non-Goals

Apply the explanation rule throughout native proposing reached through `loop-propose`. Native proposing retains responsibility for when clarification is needed, root and schema selection, artifact creation and the planning boundary. Direct invocation of native proposing without the wrapper is outside this change.

## Decisions

- Add a question-presentation instruction in `skills/loop-propose/SKILL.md` before it loads native proposing. State that the instruction applies to decision questions throughout the delegated workflow, including initial clarification and questions encountered while creating artifacts. Adding it only to the final summary would miss the point at which the user must choose.
- Before any compact picker, explain the relevant context, what the answer changes, the options' practical tradeoffs and the recommended option with its reason in ordinary user-facing prose. Keep the explanation proportional to the decision; retain short option labels for selection.
- Maintain the guidance in this one bundled wrapper. Existing `loop-scope` delegation already reaches it, and existing `loop setup` distributes it to `.agents/skills/loop-propose/` and `.claude/skills/loop-propose/`. No repository-wide AGENTS rule, scoping-specific copy or upstream OpenSpec edit is needed.

## Risks / Trade-offs

- Direct `openspec-propose` calls bypass the wrapper and receive no added guidance; use `loop-propose` for the enhanced workflow.
- Instruction changes rely on agent compliance. Review a sample question against the spec scenario; string-matching tests would establish only that wording exists.
