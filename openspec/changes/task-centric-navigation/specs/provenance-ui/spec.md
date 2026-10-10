## MODIFIED Requirements

### Requirement: Breadcrumb on entity pages

The task, checkout, pull request and ticket pages SHALL show the entity's provenance trail as a breadcrumb whose steps link to their pages. A session step SHALL link to its task's Conversation tab with its variant selected, because sessions have no page of their own. Removed steps SHALL be shown struck through and SHALL NOT be links.

#### Scenario: Task page

- **WHEN** the user opens variant 2 of a task started from `APP-42`
- **THEN** the breadcrumb shows the ticket, the task, the variant and the branch, each linking to its page

#### Scenario: Session step

- **WHEN** a trail includes the session of variant 1 of task `abc`
- **THEN** that step links to `/p/:project/t/abc?v=1`

### Requirement: Task hub page

The task page SHALL show, across its header and tabs:

- in the header: the task's title, kind, state, ticket, status, pull requests and the reviews of them, or, for a review task, its reviews;
- the selected variant's session (Conversation), worktree changes (Changes), terminal and runtime;
- on Compare: each variant with its model, state, cost, tokens, branch, worktree, environment, session and pull request;
- on Spec: the spec chain, linking to the proposing and implementing tasks;
- the task's activity, from its header's Activity button.

For a manual task, it SHALL show the same page with its single variant, no variant switcher and no Compare tab.

#### Scenario: Multi-variant task

- **WHEN** the user opens a task with three variants, one of them published, and switches to Compare
- **THEN** the tab lists the three variants with their branches and sessions, the published one with its pull request

#### Scenario: Spec chain

- **WHEN** the user opens the Spec tab of a task that implements a change another task proposed
- **THEN** the tab links to the proposing task

#### Scenario: Manual task

- **WHEN** the user opens a manual task
- **THEN** the page shows its single conversation, changes, terminal and runtime, without a variant switcher or Compare tab

### Requirement: Created-by chips

The task, worktree, branch and environment lists SHALL show what created each entry: the task and variant, a manual action, a pull request checkout, or "created outside opendevhub". Each SHALL link to its origin. A manual task adopted from opencode SHALL read "started in opencode".

#### Scenario: Worktree list

- **WHEN** the checkouts list shows a worktree made by variant 1 of task "Add login"
- **THEN** its chip reads "Add login · variant 1" and links to the task page

#### Scenario: Adopted task in the task list

- **WHEN** the Tasks list shows a manual task whose session was created in opencode
- **THEN** its chip reads "started in opencode"
