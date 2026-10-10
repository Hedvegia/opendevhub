## Why

The UI makes the user handle three overlapping things: a task, the worktree it runs in, and the session (opencode conversation) inside that worktree. With one variant they are 1:1:1, so the task page and the session page look like two views of the same work. Review sits on the worktree's tab bar and so seems to belong to the session, not the task. Tasks can also be started from the dashboard and other pages outside a project, although every task belongs to one project. The result is that users can't tell what a session is, what a task is, or where to find the review of their work.

## What Changes

- **The task page is where work happens.** `/p/:project/t/:task` gets tabs: **Conversation** (the variant's session, which used to be its own page), **Changes** (the worktree's Review), **Terminal**, **Runtime**, plus **Spec** for spec-first tasks and **Compare** when there are 2+ variants. A variant switcher (`?v=n`) shows only when there is more than one variant. The tabs show the selected variant.
- **"Session" leaves the UI vocabulary.** The UI says "conversation" instead. **BREAKING**: the global `/sessions` page becomes `/tasks`, which lists tasks across projects. Sessions started directly in opencode show as tasks labelled "started in opencode". Other conversations that ran in the same worktree show as threads in the Conversation tab.
- **New task only inside a project.** The dashboard's New task button is removed. The `n` shortcut and the command palette's New task work only on project pages. The New task dialog no longer has a project picker. Entry points outside a project (Jira "Start task") pick the project before the dialog opens.
- **Worktree pages are secondary.** A worktree created by a task variant redirects to that task. The main checkout and worktrees without a creating task (PR checkouts, ones created by hand or outside opendevhub) keep a standalone page with Changes · Terminal · Runtime and a list of the conversations that ran there, each linking to its task.
- **Redirects keep old links working.** `/p/x/w/:wt` → `/p/x/t/:task?v=n`; `/p/x/w/:wt/s/:session` → the session's task with that variant (and thread); `/p/x/w/:wt/review` → `/p/x/t/:task/changes?v=n`; any `/p/x/{main|w/:wt}/s/:session` → its task; `/sessions` → `/tasks`.
- **Project page.** Sections: Needs you, Tasks, Ended tasks, Worktrees (secondary: only worktrees no task created, and the main checkout). The "Other sessions" section is removed because every session already belongs to a task.
- Provenance links, notifications and activity events that pointed at session pages now point at the session's task.

## Capabilities

### New Capabilities

- `task-navigation`: the page structure, with the task as the place to navigate to. Covers the task page's tabs and variant switcher, the Conversation tab and its threads, the global Tasks page, where tasks can be started, secondary worktree pages, and redirects from old session, worktree and review URLs.

### Modified Capabilities

- `provenance-ui`: the breadcrumb no longer has a session page to appear on, and session steps link to their task's Conversation tab. The task hub's contents are spread across tabs. Created-by chips move from the session list to the task lists.

## Impact

- Web routes (`apps/opendevhub/src/web/app.tsx`): new task child routes; session, worktree and review routes become redirects or secondary pages; `/sessions` becomes `/tasks`.
- Pages: `features/tasks/project-task.tsx`, `task-hub.tsx`; `features/sessions/session-page.tsx` (becomes the Conversation tab body), `sessions-page.tsx`, `session-list.tsx`; `features/checkouts/checkout-page.tsx`, `checkouts.ts` (`sessionPath`, `sessionPagePath`); `features/review/project-review.tsx` (embedded in the task); `features/projects/overview.tsx`, `project-overview.tsx`; `features/tasks/new-task-dialog.tsx`; `features/jira/jira-page.tsx`; `shell/shell.tsx`, `shell/command-palette.tsx`; `dashboard-context.tsx` (`newTask` takes a required project).
- Server: `server/db/provenance.ts` session step links; `shared/notices.ts` notification URLs.
- No database or API shape changes. Tasks, variants and manual tasks already give every session a task.
- Storybook stories and web tests for the moved pages.
