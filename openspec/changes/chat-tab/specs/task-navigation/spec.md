## MODIFIED Requirements

### Requirement: Conversation tab

The Conversation tab SHALL show the selected variant's session: its pending permission and question cards, its turns with their changes, its subagents, and its usage. Besides the Chat view, which shows the same conversation full-width, it SHALL be the only place in the UI that shows a single session in full. When other top-level sessions have run in the same directory, the tab SHALL list them as threads, with the variant's own session first. The selected thread SHALL be held in the `thread` search parameter. Each thread that belongs to another task SHALL link to that task. The UI SHALL call sessions "conversations", not "sessions".

#### Scenario: Answering a permission

- **WHEN** the variant's session waits for permission to run a command
- **THEN** the Conversation tab shows the permission card and the user can answer it there

#### Scenario: Several conversations in one worktree

- **WHEN** a manual session was also started in a task variant's worktree
- **THEN** the Conversation tab lists two threads, the variant's session first, and selecting the second shows it with a link to its own task

#### Scenario: Removed session

- **WHEN** the selected variant's session is gone from opencode
- **THEN** the Conversation tab says the conversation was removed, and the other tabs still work while the worktree exists

#### Scenario: Same conversation in Chat

- **WHEN** a task was started from Chat and the user opens its Conversation tab
- **THEN** the tab shows the same turns and pending cards as its chat view

### Requirement: Tasks start inside a project

The New task dialog SHALL always be opened for one project and SHALL NOT offer a project picker. The dashboard SHALL NOT have a New task button. The `n` shortcut and the command palette's New task command SHALL be available only on project pages (the project, its tasks and its worktrees), and SHALL open the dialog for that project. An entry point outside a project that starts a task (for example from a Jira ticket) SHALL make the user choose the project first, then open the dialog for it. The Chat page SHALL be the one exception: it starts a task from its own composer, with a project picker, and does not open the New task dialog.

#### Scenario: Shortcut on the dashboard

- **WHEN** the user presses `n` on the dashboard
- **THEN** no dialog opens

#### Scenario: Shortcut in a project

- **WHEN** the user presses `n` on a task page of project `app`
- **THEN** the New task dialog opens for `app` and shows no project field

#### Scenario: Start from a Jira ticket

- **WHEN** the user clicks Start task on ticket `APP-42` and chooses project `app`
- **THEN** the New task dialog opens for `app` with the ticket filled in

#### Scenario: Start from Chat

- **WHEN** the user picks project `app` on the Chat page and sends a message
- **THEN** a task starts in `app` without the New task dialog opening
