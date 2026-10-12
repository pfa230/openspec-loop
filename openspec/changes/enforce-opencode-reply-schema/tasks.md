# Tasks

## 1. Native OpenCode reply pipeline

- [ ] 1.1 Add the bundled schema hook, JSONC parsing dependency and child-only configuration overlay, with an optional environment parameter in `runHarness()`. Verify adapter-boundary tests show the exact supplied schema enables native format only for the root session, inherited inline JSONC/settings/plugin entries survive, invalid configuration fails explicitly, and other adapters retain their existing environment and behavior.
- [ ] 1.2 Replace OpenCode final-text parsing with successful native `StructuredOutput` completion handling, preserve usage and child exits, and add the named `--pure`/remote `--attach` incompatibility errors. Update the OpenCode README guidance alongside regression fixtures/tests: cut-report-plus-JSON text cannot create a reply, a separate native result can, native/session failures cannot be hidden by valid text, and the adapter invokes the harness only once. Verify compatible model/agent/variant/restriction arguments pass unchanged and errors preserve reported usage.
- [ ] 1.3 Run the compiled adapter against the installed OpenCode 1.18.34 in a disposable directory with the configured MiMo model, requesting a cut report and a small schema reply. Verify the hook loads, the transcript has the report and a completed native structured tool, the reply contains only the required object and usage remains reported; retain a small redacted native recording and exercise it in the adapter tests.

## 2. Integration verification

- [ ] 2.1 Extend the existing implementation-cycle fixtures to demonstrate that the issue #54 boundary failure preserves worker edits without committing or running that attempt's checks/review, and that a valid native reply proceeds through the loop's normal commit/check/review sequence. Verify the regression fails when adapter-native reply routing is replaced with final-text parsing.
- [ ] 2.2 Run `npm test` and `openspec validate enforce-opencode-reply-schema --strict`; review the patch against the amended contract and run the required cut pass, removing any new mechanism or task without a concrete clause or #54 acceptance need. Verify all checks pass and the retained-item list matches the final implementation.
