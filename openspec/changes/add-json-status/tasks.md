# Tasks

## 1. JSON status interface

- [ ] 1.1 Add `status <change> --json` parsing and usage in `src/cli.ts` and serialize the existing observation in `src/commands.ts` per the JSON run status requirement. Extend the CLI missing-run case to exercise the accepted option and verify retained exit 2/stderr diagnostics with empty error stdout.
- [ ] 1.2 Extend existing status observations in the control, stepping, and decision-stop tests to verify all five status values, the five response fields, report parity for stable observations, and question/recovery preservation. Keep ordinary text assertions and run `npm test` successfully.
- [ ] 1.3 Update `docs/operations.md` with the option, response contract, and host integration sequence from the design. Verify the example against the CLI output and the existing local-delivery and plan-edit recovery behavior.
