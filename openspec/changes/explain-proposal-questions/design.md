# Design

## Context

See `proposal.md` for the reported problem. Native proposing's tracked instructions in `.agents/skills/openspec-propose/`, `.claude/skills/openspec-propose/` and `.claude/commands/opsx/propose.md` ask for clarification but do not require contextual explanations. The bundled `skills/openspec-scope/SKILL.md` invokes native proposing and later asks about unresolved decisions. The supervision skill already explains decision questions after a run stops, but that guidance does not cover proposal authoring.

## Goals / Non-Goals

Cover direct proposing in this repository and native proposing nested inside the bundled scoping skill. Editing upstream OpenSpec generation, changing question-tool interfaces, and changing unattended review recovery are outside this change.

## Decisions

- Add one proposal-question rule to repository `AGENTS.md` for direct native proposing. Do not patch generated native skills: regeneration would overwrite that patch, and repository instructions are already loaded by the proposing workflow.
- Add the same guidance to the bundled scoping skill before its native-proposing invocation so it applies while that invocation runs as well as during the later decision sweep. Other projects do not inherit this repository's `AGENTS.md`, so the bundled instruction is also necessary. Refresh only its project copies through existing `loop setup`.
- Require ordinary explanatory prose before a compact picker. Short option labels can still be used for selection, while the preceding explanation supplies context, consequences, tradeoffs and the recommendation's rationale. Keep the detail proportional to the decision.

## Risks / Trade-offs

- Native proposing outside this repository and outside bundled scoping does not inherit this guidance; extending upstream OpenSpec is separate work.
- Instruction changes rely on agent compliance. Review a sample question against the spec scenario; string-matching tests would establish only that wording exists.
