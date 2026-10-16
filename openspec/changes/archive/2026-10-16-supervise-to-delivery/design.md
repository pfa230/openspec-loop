# Design

## Context

The bundled `skills/openspec-loop/SKILL.md` makes every stop wait for the user. Line 22 allows `loop resume` or another `loop step` only after the user agrees. Line 23 and step 4 of "Diagnosing a stop" end with "Do nothing more until the user chooses". "Answering a decision stop" keeps the run stopped until the user answers every question, and asks separately for authorization to record, commit and resume. The Supervision skill requirement says the same: the skill "SHALL repair or continue only with the user's agreement".

The recoveries the skill already lists are a plan or decision edit committed on the run's branch followed by `loop resume`, `loop resume --attempts <n>` and `loop resume --implement`. This change keeps that list and lets the supervisor apply it.

The `.agents/skills/openspec-loop/SKILL.md` and `.claude/skills/openspec-loop/SKILL.md` copies match the bundle byte for byte. `test/setup.test.ts` already covers installing and refreshing them.

## Goals / Non-Goals

**Goals:** The supervisor drives a stopped run to delivery with the recoveries the skill already lists, and stops for the user only when a recovery needs the user.

**Non-Goals:** Changing the controller, the report, run state, worker protocols, the CLI or the scoping skill. Letting the supervisor edit implementation code, touch the main checkout or the remote, or change the environment. Changing diagnosis, which stays read-only, or `loop step` stage boundaries, which still wait.

## Decisions

### Recover with plan edits and resume commands only

The supervisor fixes a stop by editing the change's plan in the run's worktree, committing it on the run's branch, and resuming with whichever resume form fits: plain, `--attempts <n>` after exhausted attempts, or `--implement` after a plan edit to a run whose implementation is complete. These are the recoveries step 4 already offers. Code stays the implementer's: a supervisor's code edit would bypass the implementer and land outside the loop's review, against the repository rule to deliver through the loop.

### Hand over only what needs the user

The supervisor hands a stop to the user when none of its recoveries addresses the cause without a decision that neither the user's instructions in the session, the source issue, the plan nor the repository's rules settle. The recovery set itself excludes everything outside the run's worktree and branch: the environment, credentials, quota or billing, the main checkout, which other sessions share, the remote, and discarding the run. So integration and delivery stops for a dirty checkout, diverged commits or a rejected push keep their current recovery with the user, and so does a quota stop. A decision the design records is settled by the plan, so changing it is a decision the sources do not settle and goes to the user. A stop the user requested stays stopped.

### A repeated cause ends autonomous recovery

When a run the supervisor resumed stops again for the cause it recovered from, the supervisor hands the stop to the user with both diagnoses. This bounds retries without a counter. A stop whose cause the evidence leaves open gets one recovery like any other. The conversation already holds the previous diagnosis, so no state or record is added.

### Answer settled decisions, hand over open ones

For a decision stop, the supervisor answers each question that the sources above settle and names the source of each answer. When every question is settled, it records the answers in the design, commits them and resumes. When some stay open, it shows the report and hands over only the open questions, in the existing numbered handoff with explanations and recommendations. Recommendations still decide nothing. The user's answers authorize recording, committing and resuming, so the separate authorization round trip goes away. The resumed plan returns to proposal review, as before.

### Report each recovery before applying it

The supervisor still shows the report unchanged and gives the diagnosis. It then states the recovery it applies and applies it in the same turn. The user sees every action and can run `loop stop` at any time.

### Update the bundle, its copies and the README together

The bundled skill is authoritative. Its two tracked project copies are refreshed to match, and the README's supervision paragraphs are updated. No installer changes are needed.

### Validate the prose against the scenarios

Walk the changed skill through each added and modified scenario. Run `npm test` for the existing distribution coverage. No wording tests or model-evaluation harness are added.

## Risks / Trade-offs

- The supervisor may treat an open decision as settled. Mitigation: it names the source of each answer, the user can stop the run, and the edited plan goes through proposal review again.
- Autonomous resumes spend attempts and tokens without the user's approval. This is the requested trade. The repeated-cause rule bounds it, and quota and billing stops go to the user.
