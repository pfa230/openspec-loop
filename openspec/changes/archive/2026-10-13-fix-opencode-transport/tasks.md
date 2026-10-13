# Tasks

## 1. Explicit transport lifetime

- [x] 1.1 Verify a direct Undici dependency's engines include the package's Node support and route the OpenCode requests through an owned dispatcher with header/body inactivity timeouts disabled, reusing the existing abort/server lifecycle. Extend the fixture/tests for delayed headers, paused bodies and quiet events; shorten both Agent-constructor defaults and global-dispatcher defaults in a test-only preload. In identically configured child controls, establish the specific header/body timeout codes through the imported client and global fetch, then verify the real adapter succeeds with native output and usage. Verify removing either zero setting, omitting the dispatcher or returning to global fetch makes the regression fail, and interruption still cancels each wait. Document the behavior in README.md and verify the focused adapter suite passes.

## 2. Retained failure evidence

- [x] 2.1 Add method/path and request-versus-response-read context while preserving original causes, and write the inspected error to the existing transcript before cleanup. Test real disconnects before headers, during the prompt body and during event reading; verify operation context, nested transport name/code/stacks, retained evidence and reported usage. Set fixture authentication and assert the password and Basic-auth value never appear in stdout/stderr. Reuse existing lifecycle and HTTP/session/native failure coverage, document the diagnostic fields in README.md and verify the focused adapter suite passes.

## 3. Integration verification

- [x] 3.1 Run npm test with the installed runtime and with temporary Node 24 using npm exec --yes --package=node@24 -- npm test; confirm the latter runtime with the same prefix followed by node --version. Verify native-result selection, permissions, usage and owned-server cleanup remain correct without publishing for CI. Validate the OpenSpec change and perform the repository's final cut pass before presenting implementation results.
