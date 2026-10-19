# Design

## Context

See `proposal.md` for the requested backlog overview. `skills/openspec-scope/SKILL.md` already records `Source issue: <URL>` in each scoped proposal. `pfa-dev:issues` supplies the reference presentation: counted groups, bugs first, one line per item, then a reasoned order of attack. It is a personal plugin, so the shipped skill must describe its own workflow rather than require that plugin.

`src/setup.ts` enumerates bundled skill directories, and `package.json` already includes `skills`. No discovery or packaging code needs changing. `test/setup.test.ts` compares installed contents against bundled contents, but some expected destination lists name only `openspec-loop` and `openspec-scope`.

## Goals / Non-Goals

**Goals:** Keep discovery in native OpenSpec and classification in the agent, using the existing proposal artifacts and recorded issue URLs.

**Non-Goals:** A TypeScript listing service, a proposal registry, new metadata fields, all-worktree aggregation, automatic run selection, grouping flags, or a dependency on the personal `pfa-dev` plugin.

## Decisions

### Ship the skill through existing setup

The user selected an agent skill like `openspec-scope`. Add `skills/openspec-proposals/SKILL.md` with frontmatter naming the skill and triggers for listing proposed changes or proposed issues after scoping. Document `$openspec-proposals` for Codex and `/openspec-proposals` for Claude Code. Refresh both committed project copies with `loop setup` and update existing setup test expectations to include the added skill. Keep runtime and package configuration unchanged: both already discover every bundled directory.

### Use the invoking root as the backlog

Default: run native `openspec context --json` and `openspec list --json` from the invoking checkout. If the user names a store, discover it with `openspec store list --json` and retain `--store <id>` on applicable commands. Honor the resolved root, including a configured store pointer. Report a discovery failure or missing root and stop without initializing anything. Show the resolved root with the listing so the scope is visible.

Use exactly the active changes native listing returns, without `--all` or `--archived`. Do not scan sibling worktrees, fetch branches or filter by GitHub issue state or loop enrollment. This works inside an unfinished scoping session and, after its proposals land, from the default checkout. Read each change's available `proposal.md` and `.openspec.yaml` under the resolved changes directory. Retain drafts missing those files; identify unavailable fields rather than excluding the change. If no changes exist, say so and omit the order section.

### Enrich only recorded source issues

Use the `Source issue:` URL recorded in each proposal, retaining repository identity for cross-repository links. Read referenced issue metadata with `gh issue view <URL> --json number,title,labels,assignees`; read label descriptions per referenced repository with `gh label list` to separate kind, area and priority. Reuse repository issue-listing instructions where applicable. Never start from all open issues: the proposal files define membership, including proposals for issues that have since closed. Keep one listing row per change even when several proposals share a source issue.

Use issue titles for linked rows and a short summary from proposal text otherwise; use `.openspec.yaml`'s `created` date and `-` for unavailable dates. An unlinked proposal shows `-` in the source column; a draft without a proposal shows `draft` as its summary. If GitHub metadata cannot be read, report that limit, preserve the recorded issue link, and explicitly mark any classification inferred from available proposal text. Do not invent labels, issue numbers or dates.

### Follow the reference's default presentation

State the derived kind and area axes before listing. Put bugs in `Bug` first, then group remaining proposals by repository area; choose the rarer area in the listed set when several match and show the secondary area inline. Infer classifications from proposal text when needed and mark them with `~`; use `Other` only when no area can be established. Sort area groups by descending count, `Other` last, and rows newest first with unavailable dates last. Keep titles to about 90 characters on one line. Brackets carry secondary area, priority and assignee when available, following `pfa-dev:issues`.

Each row contains change name, proposal date, source issue link when recorded, and title or summary. For example:

```text
## Bug (1)
fix-worker-exit  2026-10-19  #42  Preserve the worker's exit status  [adapters]

## Planning (1)
clarify-proposal-order  2026-10-18  -  Explain proposal ordering ~

## Order
1. fix-worker-exit: restores reliable failure reporting before further adapter work.
2. clarify-proposal-order: small documentation change with no prerequisite.
```

In actual output, link source issue references to their recorded URLs. Recommend up to eight changes, fewer when appropriate, with one reason each. Use proposal dependencies first, then correctness, then small settled work, keeping related areas together where practical. Read design or tasks when the proposal alone does not establish dependencies or scope; state uncertainty rather than invent dependencies. Missing proposal content must not be represented as a settled implementation candidate. The listing remains read-only and does not select or start a run.

## Risks / Trade-offs

- The current checkout may not contain a scoping session's unlanded proposals. Showing the resolved root and documenting session-checkout usage makes this limit visible without a cross-worktree index.
- Label classification and order involve agent judgment. Explain axes, inferred classifications and ranking reasons so the user can assess them.
- Source issue metadata may be unavailable. Keep the local backlog complete and disclose the missing enrichment.

## Migration Plan

Existing users gain the skill by upgrading the package and running `loop setup`, as for other bundled skills. No data migration is needed.

## Cut Pass

Removed from the draft:

- A separate instruction to cache repeated source-issue reads: no observed failure requires a caching mechanism in this small agent workflow.
- A change-name tie-breaker for same-date rows: newest-first matches the reference without specifying an unnecessary total order.
- A rollback claim that removing the bundled directory and refreshing removes installed copies: setup preserves names absent from the executing bundle, so that claim was incorrect and a new cleanup mechanism is unnecessary.

Kept spec additions, each with its purpose and the failure of a smaller version:

- Sentence 1, ship a read-only `openspec-proposals` skill for both tools: the user selected the same interface as `openspec-scope`; a terminal command or one-tool skill misses that request.
- Sentence 2, list every active change in the selected root with identifying fields: the user needs the proposed backlog; listing open issues instead includes unproposed work, and omitting the change name prevents choosing a proposal to run.
- Sentence 3, group bugs first and other proposals by area, marking inference: preserves the requested reference presentation; an ungrouped list loses its area overview and unmarked guesses look like recorded labels.
- Sentence 4, recommend an order with proposal-based reasons: preserves the reference's order of attack; source issue metadata alone does not establish dependencies between the actual plans.
- Scenario, overview after batch scoping: demonstrates the requested use case across several proposals; a single-proposal example cannot demonstrate grouping or order.
- Scenario, drafts and unlinked proposals: verifies that listing membership comes from OpenSpec; requiring a source issue or complete proposal would omit active changes native listing returns.

Kept mechanisms and checks:

- Native context/list resolution, retaining an explicitly selected store: serves sentence 2; reading a hardcoded local directory misses a configured or named store.
- Visible resolved root and discovery-error reporting: serves sentence 2; a bare empty list cannot distinguish the wrong checkout from an empty backlog or failed discovery.
- Reading available proposal and creation metadata: serves sentence 2; directory names alone lack summaries and source issues.
- Retaining drafts and identifying missing fields: serves sentence 2 and the second scenario; file-completeness filtering drops active changes.
- Empty-backlog message without an order: serves sentence 2; recommending a first change when none exist fabricates work.
- Referenced issue reads and repository label descriptions: serves sentence 3; the existing scoping source record is only a URL and contains no kind or area labels.
- Preserving recorded links and disclosing unavailable enrichment: serves sentences 2 and 3; treating unavailable GitHub metadata as absent proposals loses listed changes or silently fabricates labels.
- Counted bug/area groups and the reference's multi-area rule: serves sentence 3; placing one proposal in several groups duplicates the backlog and counts.
- Inference markers and `Other` only when needed: serves sentence 3; unlinked proposals otherwise disappear or acquire seemingly authoritative labels.
- Newest-first rows, compact titles and inline secondary metadata: preserves `pfa-dev:issues` presentation requested in the proposal; dropping those conventions makes the new listing harder to compare with its reference.
- Reading design/tasks only when needed for ranking: serves sentence 4; issue titles alone cannot establish plan dependencies, while always reading all artifacts adds unnecessary work.
- Up to eight reasoned recommendations: serves sentence 4 and the reference's short order section; an unexplained ordering gives no basis for the user's choice.
- Existing `loop setup` and committed copies for both tools: serves sentence 1 and the existing Project skill setup contract; a bundled source alone leaves the current project's skills unavailable until refreshed.
- README invocation and checkout-scope guidance: serves the proposal's documentation request; users otherwise cannot find the command or know where unlanded session proposals are visible.
- Updating existing setup expectations and installed-content comparisons: serves Project skill setup; the current two-name expected output fails when a third skill is bundled. No new setup test suite is needed.
- Attended walkthrough with linked, unlinked and draft changes, plus an empty root: serves the two added scenarios and discovery behavior; installation tests cannot demonstrate whether the instructions produce the requested overview. No automated agent harness or new GitHub issue is needed.
- `npm test`: required by repository instructions; reviewing Markdown alone does not satisfy the repository's required check.
- Native strict change validation: checks the delta's native format; artifact existence alone does not establish a valid OpenSpec change.
- Final diff review: serves Minimal by design; passing tests alone does not show that implementation stayed within this proposal.

Kept tasks:

- Task 1.1: lands the listing instructions and their usage documentation with an attended walkthrough; a file-existence check cannot establish the grouped overview.
- Task 1.2: refreshes both supported tool copies and updates existing setup coverage; adding only the bundled file leaves stale expected destinations and missing project copies.
- Task 2.1: checks integration and scope through the required suite, native validation and diff review; the skill walkthrough alone cannot establish compatibility with existing setup tests.

No new options, persistent state fields, records, dependencies or runtime modules are added. Discovery and installation reuse existing components.
