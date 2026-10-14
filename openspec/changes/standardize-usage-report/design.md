# Design

## Context

[verified] Each adapter walks its harness's usage object with `counters` (`src/adapters/common.ts`) and writes every numeric leaf to the usage file's `tokens` map; `usageText` and `usageTotals` (`src/controller.ts`) print every entry as `name=value`. The 2026-10-12 `report-backend-usage` change chose this deliberately and rejected canonical names, because the harnesses count differently. This change reverses that choice for the progress output, at the user's request, and answers the original objection by normalizing in the adapter, which knows its harness's counting rules, instead of by name.

[verified] Every adapter except OpenCode copies the harness's stdout into the step's transcript (`runHarness` in `src/adapters/common.ts`); OpenCode writes each subscribed event, including `step_finish` with its `tokens`, to stdout. The transcript therefore already holds every native counter, so it serves as the debug record the user asked for.

## Goals / Non-Goals

**Goals:** One end-line and role-total form for every harness: input tokens, output tokens, cost. Raw counters out of the progress output.

**Non-Goals:** A cached-token or reasoning-token column, a separate debug log, a `--verbose` switch, cost estimation for harnesses that report none, keeping the native map in the usage file.

## Decisions

### Two token totals with one meaning

`inputTokens` is every prompt token the model processed, cached or not. `outputTokens` is every generated token, reasoning included. These two have a definition every harness can meet, and together with cost they answer "how much did this step consume". A cached split was left out: the user asked for tokens and cost, and cost already reflects caching where the harness reports it.

Alternative: one `totalTokens`. It hides the input/output asymmetry that dominates agent runs (330k in, 2k out).

### Adapters map, the loop only formats

Each adapter computes the two totals from its native fields:

| Adapter | `inputTokens` | `outputTokens` | Evidence |
|---|---|---|---|
| `loop-claude` | `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` | `output_tokens` | [verified] Anthropic counts cache reads and writes outside `input_tokens`; recording shows `output_tokens` 183 ≥ `thinking_tokens` 97 |
| `loop-codex` | `input_tokens` | `output_tokens` | [verified] `input_tokens` includes `cached_input_tokens` (README). [assumption] `output_tokens` includes `reasoning_output_tokens`; verify in the Codex source before coding |
| `loop-agy` | `input_tokens` | `output_tokens` | [verified] recording: `total_tokens` 13626 = `input_tokens` 12926 + `output_tokens` 700, so thinking is inside output. [assumption] `input_tokens` includes `cache_read_tokens`; verify with a recording that has cache reads |
| `loop-opencode` | `input + cache.read + cache.write`, summed over model steps | `output + reasoning`, summed likewise | [verified] recording: `total` 24 = 11 + 8 + 5, so reasoning is outside output. [assumption] `input` excludes cache; verify in the OpenCode source before coding |

A total sums the fields the harness reported and is written when at least one was reported; an absent field adds nothing. A component that is negative or nonfinite makes the total `NaN`, which `JSON.stringify` writes as `null`, which the existing usage validation rejects. That keeps the strict-validation behavior without a separate check. The OpenCode adapter keeps its existing "invalid stays invalid" accumulation for per-step sums. Claude Code and OpenCode keep their existing cost mapping; Codex and Antigravity report none.

Alternative: keep the native map in the usage file and normalize in the controller. The controller does not know which harness wrote a file, so it would need a harness tag and a per-harness table in the loop, duplicating what the adapter already knows.

### Usage file replaces `tokens`

The usage file becomes `{ inputTokens?, outputTokens?, costUsd? }`; `isUsage` accepts only those keys. Keeping `tokens` alongside would duplicate the transcript and leave a second format to validate. Custom workers must change; this is a breaking change for the next release.

### Display

End line: `(alias; input 332,936, output 2,234, cost $0.57)`. A value the file lacks reads `input unavailable`, `output unavailable` or `cost unavailable`; a file with none reads `usage unavailable`, as today. Numbers use `toLocaleString("en-US")`; cost uses two decimals, which also removes the floating-point noise that summed costs show today. Role line: `implementer: 3 steps, 1 without usage; input 1,234,567, output 8,901, cost $1.20, 1 step without cost`. The existing "without usage" and "without cost" counts keep their meaning.

## Risks / Trade-offs

- A run resumed across the upgrade reads its older usage files as malformed, so their steps count as "without usage" in the role totals. Accepted: totals are informational and old runs are short-lived.
- An unverified mapping row double-counts or misses tokens. Tasks 1.1 verifies each `[assumption]` row before code depends on it.
- A nonzero cost below half a cent shows as `$0.00`. Accepted for readability.

## Cut Pass

| Item | Serves | Simpler version and its failure |
|---|---|---|
| `inputTokens` field | Progress and usage reporting; Worker interface | One total hides the input/output split the user reads. |
| `outputTokens` field | same | same |
| Existing `costUsd` | same | None simpler. |
| Per-adapter mapping table | Shipped adapters | Mapping by name in the controller miscounts Claude's input, which excludes cache. |
| Sum-of-reported-fields rule | Shipped adapters | Requiring every field makes OpenCode's cacheless recording report input as unavailable. |
| `NaN` for invalid components | Shipped adapters, invalid-quantity scenarios | Summing invalid values can produce a valid-looking total (-1 + 5). Uses existing validation, no new check. |
| Transcript as the raw record | User request ("debug log, or wherever it goes") | Already exists; a new debug log would duplicate it. |
| Two-decimal cost, grouped integers | User request (readable, standardized output) | Raw values print `$1.2034117000000001` in totals. |

Removed: the `counters` walker, the native `tokens` map, cached/reasoning columns, a debug-log file, a verbosity flag and a harness tag in the usage file.
