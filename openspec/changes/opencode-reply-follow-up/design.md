# Design

## Context

See `proposal.md` for the failure. This plan is based on `origin/main` at `5c9851d`, whose adapter code matches 0.8.3. `src/adapters/opencode.ts` creates one root session, subscribes to `GET /event`, posts the worker prompt to `POST /session/:id/message` with the worker's selections, and waits for both the prompt response and the root session's `idle` status. `events()` returns on that idle event and cancels its subscription. A completed prompt without a root `loop_reply` call fails with "opencode completed without a loop_reply call in the root session".

[Verified] A disposable copy of the 0.8.3 adapter that resubscribed and posted one more message to the same session, "You ended the turn without calling loop_reply. Call loop_reply now with the reply; do not repeat the work.", succeeded in three of three Muse runs that had failed without it.

## Goals / Non-Goals

**Goals:** Let a model that ends its turn without the reply-tool call supply the reply in the same session, at most once.

**Non-Goals:** Parsing text, a configurable retry count, a new session or worker process, and changes to the reply tool or other adapters.

## Decisions

### Loop twice over the existing prompt block

Wrap the existing subscribe, post and wait block in a loop over two prompt texts, the worker prompt and the follow-up text above, and leave the loop once `reply` is set. Each pass subscribes before it posts, because `events()` cancels its reader on idle. The request body stays the same apart from the text, so the follow-up keeps the worker's model, agent and variant. A failure leaves the `try` block before the second pass, and the existing missing-reply failure after `finally` stays the only place that reports a missing reply. `steps` already sums usage across both prompts.

### Test with a second stub stream

The OpenCode stub in `test/helpers.ts` replays `STUB_STREAM` for every message request. Add `STUB_FOLLOW_UP_STREAM`, replayed for the second message request when set, so a test can script a text-only first turn and a reply in the follow-up.

## Risks / Trade-offs

- [A missing reply costs one more model turn] → It happens at most once. In the probe it cost about 36,000 input tokens on a cached session.

## Migration Plan

Only a new OpenCode worker invocation changes. Rolling back the adapter restores the immediate missing-reply failure.
