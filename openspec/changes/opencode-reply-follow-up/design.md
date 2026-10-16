# Design

## Context

See `proposal.md` for the failure. This plan is based on `origin/main` at `c6e21d3` (0.8.3). `src/adapters/opencode.ts` creates one root session, subscribes to `GET /event`, posts the worker prompt to `POST /session/:id/message` with the worker's model, agent and variant, and waits for both the prompt response and the root session's `idle` status. `events()` returns on that idle event and cancels its subscription. The reply is the decoded input of the root session's last completed `loop_reply` call, and usage sums the latest `step-finish` report per part id in `steps`. A completed prompt without that call fails with "opencode completed without a loop_reply call in the root session".

Planning probes on 2026-10-16, all against OpenCode 1.19.1 unless noted:

- [Verified] The installed 0.8.3 adapter with `meta/muse-spark-1.3-contributor` and a prompt that reads `README` failed with a missing reply in every run: twice on 1.19.1 with the default agent, once with `--agent plan`, and once on 1.18.34. It also failed with a string-only schema. The tools were `read` calls only, and the final step finished with `stop` after text. `GET /experimental/tool` showed `loop_reply` offered with the intended schema.
- [Verified] The recorded Muse success in `test/recordings/opencode-api-muse.json` comes from a prompt that forbids commands and file reads. Its only tool call is `loop_reply`.
- [Verified] A disposable copy of the 0.8.3 adapter, changed to resubscribe and post one more message to the same session with the same model and agent, succeeded in three of three Muse runs. The message was "You ended the turn without calling loop_reply. Call loop_reply now with the reply; do not repeat the work." After it, the only tool called was `loop_reply`, the reply was `{"planProblem":null}`, and usage covered both prompts (about 89,000 input tokens, against about 53,000 for the failed single prompt).
- [Verified] MiMo (`opencode/mimo-v2.6-flash-free`) replies through `loop_reply` on the first prompt with 0.8.3, so it never reaches the follow-up.

## Goals / Non-Goals

**Goals:** Let a model that ends its turn without the reply-tool call supply the reply in the same session, at most once, without redoing the work or reading a reply from text.

**Non-Goals:** Parsing or repairing text, forcing a tool choice, a configurable or repeated retry, a new session or worker process, changing the reply tool or its checks, changing permission handling, and changing other adapters. No new option, state field or record.

## Decisions

### One follow-up prompt in the same session

Move the existing subscribe, post and wait sequence into one function that takes the prompt text, and call it once with the worker prompt. When that prompt completes with no response error and no decoded reply, call it once more with the follow-up text, unchanged from the probe: "You ended the turn without calling loop_reply. Call loop_reply now with the reply; do not repeat the work." Both calls send the same model, agent and variant selections, so the follow-up runs on the worker's model. Without them, OpenCode would answer with the agent's default model [assumption: per-message model selection; the probe always sent them, so verify with a stub request assertion in task 1.2]. Each call subscribes to `/event` before it posts, as the first prompt does today, so no event of the follow-up is missed and `events()` still ends on that prompt's own idle status.

Any thrown error, response error, session error, unexpected exit or interruption already leaves the `try` block or aborts the controller before the second call, so failures get no follow-up without a separate check. The existing missing-reply failure after the `finally` block stays the single place that reports a missing reply.

Alternatives considered: a stronger instruction in the first prompt or the tool description. It is untested against Muse, and the current instruction already names the call that Muse plans and skips. Forcing a tool choice is impossible, because Muse rejects every choice except `auto`. Starting a new session would lose the work's context and repeat it.

### Usage and transcript reuse existing records

`steps` already collects `step-finish` parts of the root session by id, so the follow-up's model steps add to the same usage file without new code. The second prompt's `prompt.response` line and its user message event show the follow-up in the transcript, so no new transcript record is needed.

### Test the follow-up at the stub and with a live recording

The OpenCode stub in `test/helpers.ts` replays `STUB_STREAM` for every message request. Add `STUB_FOLLOW_UP_STREAM`, replayed for the second message request when set, so a test can script a text-only first turn and a reply-tool follow-up. The existing missing-reply tests then exercise two prompts with no reply.

During apply, run the compiled adapter with installed OpenCode 1.19.1 against `meta/muse-spark-1.3-contributor` in a disposable Git directory, with a prompt that requires reading a file and a nullable `planProblem` schema, under the default agent and `--agent plan`. Capture a redacted recording of one run and replay it, so the test covers the real event order of a follow-up. Also confirm that MiMo still replies on its first prompt with no follow-up. This is manual verification, not network inference added to `npm test`.

## Risks / Trade-offs

- [A model redoes work in the follow-up] → The follow-up asks it not to, and the probes made no other tool calls. Any edits it makes are still in the worktree, where the loop's existing review and checks see them.
- [Every missing reply costs one more model turn] → The follow-up runs only after a completed prompt without a reply, and at most once. In the probe it cost about 36,000 input tokens on a cached session.
- [A future OpenCode emits a stale idle status on the new subscription] → The live recording and the replay test cover the event order observed on 1.19.1. A premature end still fails as a missing reply rather than accepting a wrong one.

## Migration Plan

This changes only what a new OpenCode worker invocation does after a completed prompt without a reply. Saved runs, reply files and role schemas do not change. Rolling back the adapter restores the immediate missing-reply failure.

## Cut pass

- Kept the single follow-up prompt for the amended Shipped adapters clause; the simpler immediate failure is today's behavior, which fails every Muse worker.
- Kept the model, agent and variant on the follow-up for the same clause; omitting them can send the follow-up to the agent's default model [assumption, see Decisions].
- Kept resubscribing before the follow-up for the same clause; reusing the ended subscription misses the follow-up's events, because `events()` cancels its reader on idle.
- Reused the existing response-error, session-error, exit and interruption paths for the "failed prompt gets no follow-up" clause; a separate check would duplicate them.
- Reused `steps` for the usage-covers-both-prompts scenario; no second accumulator is needed.
- Reused the `prompt.response` line and OpenCode's own user-message event for the transcript scenario; a dedicated follow-up record would duplicate them.
- Kept `STUB_FOLLOW_UP_STREAM` for the follow-up scenario; replaying one stream for both prompts cannot script a reply that arrives only in the follow-up.
- Kept a live Muse recording for the follow-up scenario's real event order; a synthetic stream alone cannot show that the new subscription sees only the follow-up's idle status.
- Kept the MiMo first-prompt check for the follow-up clause's "only without a reply" condition; Muse alone always takes the follow-up path.
- Kept the README sentence for the `loop-opencode` paragraph, which today says a missing call fails the step.
- Removed a configurable follow-up count, because one follow-up fixed every probe.
- Removed changes to the first prompt's instruction and the tool description, because no evidence shows they help Muse.
- Removed a new session or worker process, because the same session keeps the work's context.
- Removed text parsing, because the contract keeps the reply-tool call as the only reply source.
