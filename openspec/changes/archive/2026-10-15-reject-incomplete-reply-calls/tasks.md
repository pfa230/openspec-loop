# Tasks

## 1. Reply tool rejects incomplete calls

- [x] 1.1 In `src/adapters/opencode.ts`, make the generated `loop_reply.js` `execute(args)` throw an error naming each required top-level property of the worker schema that `args` lacks, and return "Reply recorded." otherwise; verify with the test in 1.2
- [x] 1.2 In the existing tool test in `test/adapters.test.ts`, assert that `execute` with the schema's required properties returns a string and that `execute({})` rejects with an error naming the missing property; verify with `npm test`
- [x] 1.3 In `README.md`'s `loop-opencode` paragraph, state that the tool rejects a call missing required properties and the model can call it again within its turn; verify the paragraph matches the amended Shipped adapters requirement
