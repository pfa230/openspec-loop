# Tasks

## 1. Send one follow-up prompt when a completed prompt has no reply

- [ ] 1.1 In `src/adapters/opencode.ts`, wrap the subscribe, post and wait block in a loop over the worker prompt and "You ended the turn without calling loop_reply. Call loop_reply now with the reply; do not repeat the work.", leaving the loop once `reply` is set.
- [ ] 1.2 Add `STUB_FOLLOW_UP_STREAM` to the OpenCode stub in `test/helpers.ts`, replayed for the second message request when set, and clear the stub's stream-closed flag when each `/event` subscription opens, so shutdown waits for the second stream. In `test/adapters.test.ts`, add a test where a text-only first prompt is followed by a `loop_reply` follow-up, asserting the reply and two message requests with the same model. Extend the existing missing-reply test to assert two message requests. Verify with `npm test`.
- [ ] 1.3 Add one sentence to the `loop-opencode` paragraph in `README.md` describing the follow-up.

## 2. Verify

- [ ] 2.1 Run the compiled adapter with OpenCode 1.19.1 against `meta/muse-spark-1.3-contributor` in a disposable Git directory, with a prompt that reads a file and the nullable `planProblem` schema, and verify the reply `{"planProblem":null}`.
- [ ] 2.2 Run `openspec validate opencode-reply-follow-up --strict --no-interactive` and `npm test`.
