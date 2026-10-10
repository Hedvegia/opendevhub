## 1. Shared link helper

- [ ] 1.1 Add `taskHref(projectId, taskId, { v?, thread?, tab? })` in `shared/` with unit tests
- [ ] 1.2 Rewrite `sessionPath` in `features/checkouts/checkouts.ts` to return the session's task href (variant, plus thread when it isn't the variant's own session), falling back to the checkout page when the session has no task yet
- [ ] 1.3 Point the session step in `server/db/provenance.ts` and the notice URLs in `shared/notices.ts` at `taskHref`; update their tests

## 2. Checkout context seam

- [ ] 2.1 Add a `CheckoutProvider`/`useCheckoutContext` giving `{ view, checkout, sessionId? }`
- [ ] 2.2 Make `CheckoutPage` provide it from route params, and switch `ProjectReview`, `CheckoutTerminal`, `CheckoutRuntime` and the `SessionPage` body to read it instead of params (no visible change; existing tests stay green)

## 3. Task page tabs

- [ ] 3.1 Add task child routes in `app.tsx`: `/` (Conversation), `changes`, `terminal`, `runtime`, `spec`, `compare`; turn `ProjectTask` into a layout with header, variant switcher, tab bar and `Outlet`
- [ ] 3.2 Add variant selection from `?v=` (default: picked, else first not discarded, else 1), and a switcher shown only for 2+ variants that keeps the current tab
- [ ] 3.3 Provide the checkout context from the selected variant's directory and session; render Changes, Terminal and Runtime from the shared components, and show an empty state when the worktree was removed
- [ ] 3.4 Build the Conversation tab from the `SessionPage` body: pending cards, turns, subagents, usage; a "conversation removed" state; drop its checkout breadcrumb
- [ ] 3.5 Add threads to Conversation: other top-level sessions in the same directory and environment, own session first, `?thread=` selection, collapsed "N other conversations here" toggle, link to each thread's task
- [ ] 3.6 Move Spec (`SpecSection`, spec chain) into the Spec tab for spec-first tasks; move the compare table and Pick into the Compare tab (2+ non-discarded variants); keep the ticket, PR and AI reviews in the header area
- [ ] 3.7 Add a note on the Changes tab for workspace tasks that the main checkout's diff is shared with other conversations
- [ ] 3.8 Web tests for tab visibility, variant default and switching, and threads; update the task page stories

## 4. Secondary worktree pages and redirects

- [ ] 4.1 Rename the checkout's Sessions tab to Conversations, listing the tasks whose sessions run there (each linking to its task); "New conversation" creates a manual task and navigates to its task page
- [ ] 4.2 Redirect task-created worktrees: `w/:wt` → task `?v=n`, `w/:wt/review` → `changes`, `terminal` and `runtime` kept; resolve with `<Navigate replace>` once the snapshot is loaded
- [ ] 4.3 Replace the `s/:session` checkout child route with a redirect to the session's task (variant and thread), falling back to the checkout page
- [ ] 4.4 Point the legacy `review` and `review/$target` project routes at the task when the target worktree belongs to one
- [ ] 4.5 Restrict the project page's Worktrees section to the main checkout and worktrees not created by a task variant
- [ ] 4.6 Router tests for each redirect in the spec

## 5. Tasks page replaces Sessions

- [ ] 5.1 Add `TasksPage` at `/tasks`: non-archived tasks across projects grouped by project, filters for state and "needs you", rows reusing the project page's task rows, "started in opencode" chip for adopted manual tasks
- [ ] 5.2 Redirect `/sessions` (keeping the `status` filter as the matching task filter) to `/tasks`; update the sidebar nav item and dashboard links (`/sessions?status=running`)
- [ ] 5.3 Remove the "Other sessions" section from the project page; make "Needs you" and the dashboard's "Waiting on you" link to task Conversation tabs
- [ ] 5.4 Remove `SessionsPage` and any session-list pieces left unused; update stories

## 6. Tasks start inside a project

- [ ] 6.1 Make `newTask(projectId: string, draft?)` require a project in `dashboard-context.tsx`; fix every caller the compiler flags
- [ ] 6.2 Remove the dashboard overview's New task button
- [ ] 6.3 Limit the shell `n` shortcut and the command palette's New task to project pages
- [ ] 6.4 Remove the project `Select` and its default from `NewTaskDialog`; show the project name in the dialog title
- [ ] 6.5 Turn Jira's Start task into a project chooser (a plain button when there is one project) that opens the dialog with the ticket filled in
- [ ] 6.6 Tests: no dialog on `n` outside a project, dialog without a project field inside one, Jira start flow

## 7. Copy and cleanup

- [ ] 7.1 Replace user-facing "session(s)" with "conversation(s)" across web copy (hints, empty states, tooltips, palette entries); keep code identifiers and API routes
- [ ] 7.2 Update the provenance breadcrumb and created-by chips for the modified `provenance-ui` requirements
- [ ] 7.3 Run `pnpm exec ultracite fix`, typecheck, web and server tests, and Storybook build; run `graphify update .`
