## ADDED Requirements

### Requirement: Task page tabs

The task page at `/p/:project/t/:task` SHALL be where the user works on a task. It SHALL have the tabs Conversation (the default, at the task's path), Changes (`/changes`), Terminal (`/terminal`) and Runtime (`/runtime`). It SHALL also have Spec (`/spec`) for a spec-first task and Compare (`/compare`) for a task with two or more variants that were not discarded. Every tab except Compare SHALL show the selected variant's worktree or session. The task's header (title, state, ticket, pull requests, cost, Archive, Activity) SHALL stay visible above the tabs.

#### Scenario: Single-variant task

- **WHEN** the user opens a task with one variant
- **THEN** the page shows the tabs Conversation, Changes, Terminal and Runtime, with no Compare tab and no variant switcher

#### Scenario: Changes of the task

- **WHEN** the user opens the Changes tab of a task whose variant works in worktree `add-login-v1`
- **THEN** the tab shows the review of `add-login-v1` (changed files, diffs, publishing), as the worktree's Review tab did

#### Scenario: Spec-first task

- **WHEN** the user opens a task that started with `opsx-propose`
- **THEN** a Spec tab shows the variant's OpenSpec change

### Requirement: Variant switcher

When a task has two or more variants, the task page SHALL show a variant switcher above the tabs, naming each variant by number and model. The selected variant SHALL be held in the `v` search parameter. Without `v`, the page SHALL select the picked variant, or else the first variant that was not discarded. Switching variants SHALL keep the current tab. A task with one variant SHALL NOT show the switcher.

#### Scenario: Switching variants on Changes

- **WHEN** the user is on `/p/x/t/abc/changes?v=1` and selects variant 2
- **THEN** the URL becomes `/p/x/t/abc/changes?v=2` and the tab shows variant 2's worktree changes

#### Scenario: Default variant

- **WHEN** the user opens a three-variant task where variant 3 was picked, without `v`
- **THEN** variant 3 is selected

### Requirement: Conversation tab

The Conversation tab SHALL show the selected variant's session: its pending permission and question cards, its turns with their changes, its subagents, and its usage. It SHALL be the only place in the UI that shows a single session in full. When other top-level sessions have run in the same directory, the tab SHALL list them as threads, with the variant's own session first. The selected thread SHALL be held in the `thread` search parameter. Each thread that belongs to another task SHALL link to that task. The UI SHALL call sessions "conversations", not "sessions".

#### Scenario: Answering a permission

- **WHEN** the variant's session waits for permission to run a command
- **THEN** the Conversation tab shows the permission card and the user can answer it there

#### Scenario: Several conversations in one worktree

- **WHEN** a manual session was also started in a task variant's worktree
- **THEN** the Conversation tab lists two threads, the variant's session first, and selecting the second shows it with a link to its own task

#### Scenario: Removed session

- **WHEN** the selected variant's session is gone from opencode
- **THEN** the Conversation tab says the conversation was removed, and the other tabs still work while the worktree exists

### Requirement: Tasks page

The global Tasks page at `/tasks` SHALL list the tasks of all projects that are not archived, grouped by project. It SHALL be filterable by state and by what needs the user, and SHALL replace the Sessions page. Each entry SHALL link to its task page. A manual task whose session was found in opencode rather than started by opendevhub SHALL be labelled "started in opencode".

#### Scenario: Tasks needing the user

- **WHEN** the user opens `/tasks` filtered to what needs them
- **THEN** it lists the tasks whose sessions wait on a permission or question, each linking to its task's Conversation tab

#### Scenario: Old sessions link

- **WHEN** the user opens `/sessions?status=running`
- **THEN** they are redirected to `/tasks` with the matching filter

### Requirement: Tasks start inside a project

The New task dialog SHALL always be opened for one project and SHALL NOT offer a project picker. The dashboard SHALL NOT have a New task button. The `n` shortcut and the command palette's New task command SHALL be available only on project pages (the project, its tasks and its worktrees), and SHALL open the dialog for that project. An entry point outside a project that starts a task (for example from a Jira ticket) SHALL make the user choose the project first, then open the dialog for it.

#### Scenario: Shortcut on the dashboard

- **WHEN** the user presses `n` on the dashboard
- **THEN** no dialog opens

#### Scenario: Shortcut in a project

- **WHEN** the user presses `n` on a task page of project `app`
- **THEN** the New task dialog opens for `app` and shows no project field

#### Scenario: Start from a Jira ticket

- **WHEN** the user clicks Start task on ticket `APP-42` and chooses project `app`
- **THEN** the New task dialog opens for `app` with the ticket filled in

### Requirement: Secondary worktree pages

The main checkout and every worktree not created by a task variant SHALL keep a standalone page at `/p/:project/main` or `/p/:project/w/:worktree`, with the tabs Conversations, Changes, Terminal and Runtime. The Conversations tab SHALL list the tasks whose sessions run in that checkout, each linking to its task page, and SHALL offer to start a new conversation there. A new conversation SHALL create a manual task and open its task page. The project page's Worktrees section SHALL list only these checkouts.

#### Scenario: Pull request checkout

- **WHEN** the user opens a worktree that checked out pull request #38
- **THEN** its page shows Conversations, Changes, Terminal and Runtime, and its Conversations tab lists the tasks of the sessions run there

#### Scenario: New conversation in the main checkout

- **WHEN** the user starts a new conversation on the main checkout's page
- **THEN** a manual task is created for it and the browser opens that task's Conversation tab

### Requirement: Old URLs redirect to tasks

The system SHALL redirect, replacing the history entry:

- a worktree page created by a task variant (`/p/:project/w/:worktree` and its tabs) to that task with the variant selected, mapping `review` to `changes` and keeping `terminal` and `runtime`;
- a session page (`/p/:project/{main|w/:worktree}/s/:session`) to the session's task with its variant selected, and with the session as the `thread` when it is not the variant's own session;
- `/sessions` to `/tasks`.

A session whose task cannot be found yet SHALL redirect to its checkout's page.

#### Scenario: Old review link

- **WHEN** the user opens `/p/x/w/add-login-v2/review`, a worktree variant 2 of task `abc` created
- **THEN** they land on `/p/x/t/abc/changes?v=2`

#### Scenario: Old session link

- **WHEN** the user opens `/p/x/w/add-login-v1/s/ses_1`, the session of variant 1 of task `abc`
- **THEN** they land on `/p/x/t/abc?v=1`

### Requirement: Project page lists tasks, not sessions

The project page SHALL show the sections Needs you, Tasks, Ended tasks and Worktrees. It SHALL NOT have a section for sessions without a task. Needs you SHALL list tasks, each linking to its Conversation tab. Notifications and links built by the server (provenance session steps, notices) SHALL point at the session's task.

#### Scenario: Manual session on the project page

- **WHEN** a session was started in opencode in the main checkout
- **THEN** the project page lists its manual task under Tasks, labelled "started in opencode", and has no "Other sessions" section

#### Scenario: Notification click

- **WHEN** the user clicks a notification that a session needs permission
- **THEN** the browser opens that session's task on its Conversation tab
