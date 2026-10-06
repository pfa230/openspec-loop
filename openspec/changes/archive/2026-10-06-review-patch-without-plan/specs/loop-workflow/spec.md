## MODIFIED Requirements

### Requirement: Reviews and verdicts

Each review SHALL end in a recorded `APPROVE` or `REVISE` verdict, and each finding SHALL be classified as blocking or minor. The reviewer SHALL classify the findings, and the loop SHALL derive the verdict from them. A blocking finding means the work fails the review's criteria; a minor finding has a local fix that cannot change behavior or a decision recorded in the design. A review with any blocking finding SHALL be `REVISE`, which requires revision followed by another review. A review with only minor findings SHALL be `APPROVE`: the plan reviser applies minor plan fixes and the implementer applies minor implementation fixes, the required checks run again for implementation, and the approval covers the result. Reviewers SHALL NOT modify the candidate they review. The plan is the change's OpenSpec planning artifacts (proposal, design, spec deltas, tasks) excluding task completion marks. Proposal review SHALL judge whether the whole plan can be implemented and verified as one change without asking the user, and whether it keeps the decisions recorded in the design. The change's patch is its difference from the commit it branches from on the base, outside the change's directory `openspec/changes/<change>/`, so it holds no part of the plan or its task completion marks. An implementation approval covers the change's patch, not the base it applies to. Proposal approval SHALL start implementation automatically, after any minor plan fixes.

#### Scenario: Plan approved
- **WHEN** the proposal reviewer returns `APPROVE`
- **THEN** the controller starts implementation without further user action

#### Scenario: Verdict follows the findings
- **WHEN** a reviewer reports one blocking finding among several minor ones
- **THEN** the recorded verdict is `REVISE`

#### Scenario: Only minor plan findings
- **WHEN** the proposal reviewer finds only minor issues
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
