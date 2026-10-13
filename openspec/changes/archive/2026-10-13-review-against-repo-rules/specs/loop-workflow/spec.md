# Spec Delta

## MODIFIED Requirements

### Requirement: Reviews and verdicts

Each review SHALL end in a recorded `APPROVE` or `REVISE` verdict, and each finding SHALL be classified as blocking or minor. The reviewer SHALL classify the findings, and the loop SHALL derive the verdict from them. A blocking finding means the work fails the review's criteria; a minor finding has a local fix that cannot change behavior or a decision recorded in the design. A review with any blocking finding SHALL be `REVISE`, which requires revision followed by another review. A review with only minor findings SHALL be `APPROVE`: the plan reviser applies minor plan fixes and the implementer applies minor implementation fixes, the required checks run again for implementation, and the approval covers the result. Reviewers SHALL NOT modify the candidate they review. The plan is the change's OpenSpec planning artifacts (proposal, design, spec deltas, tasks) excluding task completion marks. Proposal review SHALL judge whether the whole plan can be implemented and verified as one change without asking the user, whether it keeps the decisions recorded in the design, and whether it follows the repository's rules for change content. The repository's rules for change content are the rules its instructions for agents, such as `AGENTS.md`, set for what a change contains; a rule for how an agent works or reports is not one of them. The change's patch is its difference from the commit it branches from on the base, outside the change's directory `openspec/changes/<change>/`, so it holds no part of the plan or its task completion marks. An implementation approval covers the change's patch, not the base it applies to. Proposal approval SHALL start implementation automatically, after any minor plan fixes, during ordinary advancement; `loop step` SHALL instead return control after proposal review completes.

#### Scenario: Plan approved
- **WHEN** the proposal reviewer returns `APPROVE` during ordinary advancement
- **THEN** the controller starts implementation without further user action

#### Scenario: Verdict follows the findings
- **WHEN** a reviewer reports one blocking finding among several minor ones
- **THEN** the recorded verdict is `REVISE`

#### Scenario: Only minor plan findings
- **WHEN** the proposal reviewer finds only minor issues during ordinary advancement
- **THEN** the verdict is `APPROVE`, the plan reviser applies the fixes, and implementation starts without another proposal review

#### Scenario: Only minor findings
- **WHEN** the implementation reviewer finds only minor issues
- **THEN** the verdict is `APPROVE`, the implementer applies the fixes, the required checks run again, and no further review follows

#### Scenario: Plan revised before implementation
- **WHEN** the plan was revised or given minor plan fixes on the change's branch, and the implementation reviewer reviews a candidate
- **THEN** the patch it reviews holds none of those plan changes, and the run completes as it would without them

#### Scenario: Ticking a task box
- **WHEN** the implementer marks a task complete
- **THEN** the plan is unchanged and implementation continues under its approval

#### Scenario: Task instructions changed after approval
- **WHEN** an implementer turn changes approved task instructions or any other part of the plan
- **THEN** the run stops at implementation, names the turn's commit, and does not return to proposal review

#### Scenario: Plan breaks a repository rule
- **WHEN** the repository's instructions for agents require minimal designs and the plan adds a mechanism no requirement needs
- **THEN** the proposal reviewer reports a blocking finding and the verdict is `REVISE`

#### Scenario: Rule for how an agent works
- **WHEN** the repository's instructions for agents require an agent to present a summary after editing, and the plan contains no such summary
- **THEN** the proposal reviewer reports no finding on that rule

### Requirement: Implementation cycle

The controller SHALL run implementation as a cycle: implement, run the required checks, review the implementation, and revise as required. The implementer SHALL work from the change's native OpenSpec apply instructions, including the apply guidance the repository's OpenSpec configuration sets. The required checks SHALL be the commands listed in the loop configuration. A missing list SHALL refuse the run; an explicitly empty list SHALL mean the run has no required checks. A check that runs and fails SHALL be a check result, not an execution failure: its output SHALL return to the implementer as findings for the next attempt, and implementation review SHALL wait until the checks pass. When the checks fail after approved minor implementation fixes, the approval SHALL lapse and the failure SHALL return to the implementer as for any failed check. Implementation review SHALL judge whether the change's patch implements the whole approved plan, stays within it, keeps the decisions recorded in the design, and follows the repository's rules for change content. Implementation SHALL stay within the approved plan. Repairs SHALL be limited to failures the change caused; a failure the change did not cause SHALL NOT authorize unrelated or pre-existing repairs, so it persists until attempts run out.

#### Scenario: Change breaks a check
- **WHEN** a required check fails after implementation
- **THEN** the failure output returns to the implementer, and after the revision the checks run again before implementation review

#### Scenario: Pre-existing failure
- **WHEN** the same required-check failure also occurs on the base the change started from
- **THEN** the implementer does not expand the change to fix it, and the run stops when attempts run out

#### Scenario: No check list configured
- **WHEN** the loop configuration has no required check list
- **THEN** the loop refuses to start the run and says the list is missing

#### Scenario: Implementation review requests changes
- **WHEN** the implementation reviewer returns `REVISE`
- **THEN** the implementer revises, the required checks run again, and the implementation is reviewed again

#### Scenario: Minor fixes break a check
- **WHEN** the implementation reviewer returns `APPROVE` with minor findings and a required check fails after the implementer applies them
- **THEN** the approval lapses, the failure output returns to the implementer in the next attempt, and that attempt's patch is reviewed again after the checks pass

#### Scenario: Repository apply guidance
- **WHEN** the repository's OpenSpec configuration sets apply guidance
- **THEN** the implementer's instructions include that guidance

#### Scenario: Patch breaks a repository rule
- **WHEN** the repository's instructions for agents forbid speculative configuration and the patch adds an option no requirement needs
- **THEN** the implementation reviewer reports a blocking finding and the implementer revises

