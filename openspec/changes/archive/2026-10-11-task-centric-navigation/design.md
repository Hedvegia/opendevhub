## Context

The data model already has the right shape: Project → Task → Variant → (worktree, session). The `manual-tasks` capability gives every top-level session a task. The UI doesn't follow that shape:

- The session page is a child of the checkout route (`/p/:p/{main|w/:wt}/s/:session`), so it renders inside the checkout's tab bar (Sessions · Review · Terminal · Runtime). That makes Review look like part of the session.
- The task page (`/p/:p/t/:task`, `features/tasks/project-task.tsx`) sits outside the checkout routes. It shows Overview and Compare and only links out to each worktree's Review.
- `newTask(projectId?)` in `dashboard-context.tsx` accepts no project. The dialog then shows a project picker. It is called from the dashboard, the Jira page, the `n` shortcut and the command palette anywhere.
- `sessionPath` (`features/checkouts/checkouts.ts`) is the one helper behind most session links. `server/db/provenance.ts` and `shared/notices.ts` build their own session URLs.

This is a web-only restructure. No database or API changes are needed.

## Goals / Non-Goals

**Goals:**

- One page per piece of work: the task. Everything about a variant (conversation, changes, terminal, runtime, spec) lives in its tabs.
- "Session" disappears from the UI vocabulary in favour of "conversation".
- Tasks can only be started in the context of a project.
- Old URLs keep working.

**Non-Goals:**

- Changing how tasks, variants or manual tasks are stored, or making a variant own more than one session.
- Turning the main checkout or PR checkouts into tasks.
- Redesigning the review, terminal or runtime views themselves. They move without change.
- Renaming opencode's own concepts or the API (`/api/.../sessions` stays).

## Decisions

### 1. Task routes reuse the checkout tab components

```
/p/:project/t/:task              Conversation   (SessionPage body)
                  /changes        Changes        (ProjectReview)
                  /terminal       Terminal       (CheckoutTerminal)
                  /runtime        Runtime        (CheckoutRuntime)
                  /spec           Spec           (SpecSection, spec-first only)
                  /compare        Compare        (today's compare table)
  ?v=n        selected variant
  ?thread=id  selected conversation in the variant's directory
```

Today `ProjectReview`, `CheckoutTerminal`, `CheckoutRuntime` and `SessionPage` read their checkout from the route params via `useCheckout()`-style lookups. The plan is to introduce a small **checkout context** (`CheckoutProvider` giving `{ view, checkout, sessionId? }`). The checkout layout and the new task layout each provide it: the task layout resolves it from the selected variant's `directory` and `sessionId`. The tab bodies read the context instead of params, so the same components serve both routes.

_Alternative:_ render the checkout page inside the task page as a nested route keyed by worktree. Rejected, because it would bring back the worktree's identity and tab bar, which is the confusion we're removing.

_Alternative:_ prop-drill `directory` into each tab. Rejected, because those components already reach deep into hooks keyed by the route, so a context is the least invasive seam.

### 2. Variant selection lives in the URL search (`?v=n`)

It lives in the search, not the path, so every tab URL stays stable and switching variants keeps the tab. The default (no `v`) is the picked variant, else the first one not discarded, else variant 1. The switcher is a segmented control labelled `V1 · sonnet`. It is hidden for single-variant tasks. Compare ignores `v`.

### 3. Conversation threads are derived, not stored

A thread is any top-level session in the snapshot with the same `directory` (and `envId`) as the selected variant. The variant's own `sessionId` comes first, then the others by `updatedAt`. Other threads keep belonging to their own (manual) tasks, and the thread header links there. This needs no data change. It also means a manual task's page in the main checkout lists every other conversation in main as threads. That is intended, but those threads are collapsed behind a "N other conversations here" toggle so the page doesn't drown in them.

_Alternative:_ attach follow-up sessions to the variant (several sessions per variant). Rejected for now, because it needs a model change and manual tasks already cover it.

### 4. Worktree "owned by a task" means created by a task variant

The snapshot already gives each worktree its creator (`worktree-tracking`). A worktree whose creator is a task variant redirects to `t/:task?v=n`. The main checkout and worktrees created manually, by a PR checkout or outside opendevhub keep their page. Having a session in a worktree doesn't make it owned, because otherwise any manual session would hide its worktree's page. Redirects run in `beforeLoad` against the cached snapshot. If the snapshot isn't loaded yet, the checkout page renders a client-side `<Navigate>` once it resolves the creator.

Workspace tasks (`where: "workspace"`) run in the main checkout. Their Changes tab shows the main checkout's diff, which other conversations in main share. A note on the tab says so.

### 5. `newTask(projectId)` becomes required

`DashboardContextValue.newTask: (projectId: string, draft?) => void`. TypeScript then flags every caller:

- **Dashboard overview:** button removed.
- **Shell `n` handler and command palette:** only when `projectIdFromPath` returns a project.
- **Jira "Start task":** becomes a dropdown of projects (just a button when there is one project). Choosing one calls `newTask(id, { jira })`.
- **Forgejo handoff:** already passes a project.
- **Checkout page:** already passes one.

`NewTaskDialog` drops the project `Select` and its "first running project" default.

### 6. "Session" → "conversation" in copy only

Code identifiers (`SessionSummary`, `sessionId`, API routes) stay. User-facing strings change: "Sessions" tab → "Conversations" (secondary worktree pages), "Other sessions" removed, "open the session in opencode" → "open the conversation in opencode", and so on. The global page becomes `/tasks` with `TasksPage`, built from `projectTasks()` per project. Its rows reuse the project page's task rows.

### 7. One helper for "where does this session live"

`sessionPath(view, session)` returns `taskPath(project, session.task.id)` + `?v=n` (+ `&thread=` when the session isn't the variant's own). It falls back to the checkout page when `session.task` isn't reconciled yet. `server/db/provenance.ts` (session step href) and `shared/notices.ts` get the same rule via a shared `taskHref(projectId, taskId, { v, thread, tab })` in `shared/`.

## Risks / Trade-offs

- **Bookmarks and notifications to old URLs.** → Redirect routes cover `s/:session`, `w/:wt/*` and `/sessions`. Old session links resolve through the snapshot, and when the task can't be found yet they fall back to the checkout page.
- **A redirect can land before the snapshot has loaded.** → Resolve in the component with `<Navigate replace>` after the snapshot loads, not only in `beforeLoad`.
- **Conversation threads in the main checkout can be numerous.** → Collapsed by default. Only the task's own session is expanded.
- **"Started in opencode" relies on `SessionTaskRef.adopted`, which lasts only while the adoption event is kept.** → Acceptable. After that the task shows as a plain manual task. A stored flag can come later if it matters.
- **Removing the dashboard New task button costs a click for single-project users.** → `n` still works on any project page, and the project cards on the dashboard link straight to the project.
- **Large route and component move with test and story churn.** → Done in steps, each green: context seam first, then task tabs, then redirects, then copy and removals.

## Migration Plan

Web-only. Ship in one release, with redirects in place from the first commit that removes a page. Roll back by reverting. No persisted state changes.

## Open Questions

- Should the task header keep a direct "Open worktree page" link for power users, or is the "Open in ▾" menu (editor, terminal, opencode) enough? Proposed: no worktree link for task-owned worktrees.
