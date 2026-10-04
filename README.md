# openspec-loop

openspec-loop takes an OpenSpec change you proposed and committed, and runs it unattended to a reviewed, implemented, tested, archived and delivered result. You attend the proposal; the loop handles everything after it.

The loop is under construction. Its contract is [`openspec/specs/loop-workflow/spec.md`](openspec/specs/loop-workflow/spec.md), and the build steps are tracked as GitHub issues.

## Prerequisites

- Node 24 or later
- OpenSpec 1.14.0 or later, as the `openspec` command on PATH

## Development

```sh
npm ci      # install the pinned dev dependencies
npm test    # build and run the tests; this is the project's only check
```
