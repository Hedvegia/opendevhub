## Context

The pieces are mostly there already:

- **Composer** (`web/features/sessions/composer.tsx`) gives `/` commands and `@` mentions for a checkout directory. It is tied to an existing `SessionSummary`: it sends through `POST sessions/:sid/send`, and `running` comes from the session.
- **SessionView** (`web/features/sessions/session-page.tsx`) shows one conversation (cards, turns, composer). It takes `view`, `checkout` and `session`.
- **Starting work**:
  - `createTask` (`POST tasks`) makes a task of kind `task`, creates worktrees in the background and sends a plain prompt (or an OpenSpec command) as each variant's first turn (`firstTurn` / `startVariant` in `server/tasks/tasks.ts`).
  - `startSession` (`POST sessions`) makes a conversation in an existing checkout, owned by a manual task. The web then waits for the snapshot to list it.
- **Sending**: `Sessions.sendMessage` (`server/sessions/sessions.ts`) turns a `ComposerSendRequest` into a hub command, an opencode command (when the checkout has `/name`), or a prompt. Mentions are relative names that `toAttachments(directory, …)` resolves against the session's directory.

## Goals / Non-Goals

**Goals:**

- A Chat page with a centred composer, and project and checkout pickers.
- The first message behaves exactly like a later one (commands, mentions).
- Stay on a full-width chat view after sending. It is a different view of the same task, not a new kind of thing.

**Non-Goals:**

- A history list of chats. Tasks and ⌘K cover that.
- Model or agent pickers on the start composer (`@agent` covers the agent), and multiple variants. These can follow later.
- Chats that aren't tasks. Task-centric navigation stays.
- Remote nodes or picking the environment. Chat uses the project's defaults, as the New task dialog does before the user changes anything.

## Decisions

### 1. One server route: `POST /api/projects/:id/chat`

Body: `{ target: { kind: "worktree" } | { kind: "checkout"; directory: string }, message: ComposerSendRequest }`. Result: `{ task: string; sessionId?: string }`.

- `worktree`: build a `TaskRequest` with `where: "worktree"`, one default variant, `prompt: message.text`, the title from `deriveTitle(message.text)`, and the new field `message`. Then call the existing task start. It returns the task id at once, while setup goes on in the background.
- `checkout`: check that the directory is a checkout of the project, as the composer routes do. Call `Sessions.startWithMessage(id, directory, message)`: it resolves the message first (so a bad mention starts nothing), creates the conversation and its manual task, and sends the command or prompt to it. Return the manual task's id. (`sendMessage` can't be used here: it looks the session up in the snapshot, which only lists a new session after the next reconcile.)

_Why one route rather than calling `createTask` and `startSession` + `send` from the browser:_ the checkout path would take two round trips, and between them a session exists with no message. The browser also has no task id for the session until the snapshot catches up. On the server, the manual task is known as soon as `startSession` returns, so the route can return it right away.

### 2. Task first turns accept a composer message

`TaskRequest` gets an optional `message?: ComposerSendRequest`. When it is set, `firstTurn` uses it instead of `prompt`. To keep one source of truth, the part of `sendMessage` that maps `/name` to a command and mentions to attachments is extracted into a shared `resolveMessage(commands, directory, request)` in `server/sessions/message.ts` (`commands` lists the checkout's commands, cached for the composer). It returns `{ command?, text, attachments }`, and `sendMessage`, `startWithMessage` and `startVariant` all call it. Hub commands (`/new`, `/interrupt`) aren't valid as a first message, so the route rejects them. Unknown `/name` stays a prompt.

_Alternative:_ send the message from the browser once the variant's session appears. That fails if the tab is closed during worktree setup, and it duplicates `startVariant`'s claim/attach logic. Rejected.

### 3. Suggestions for "New worktree" come from the main checkout

The worktree doesn't exist yet. It branches from the project's base, so the main checkout's commands, agents and files are the closest match. Mentions are sent as relative names and resolved against the worktree when the first turn is sent (Decision 2). A file that exists only in the main checkout's working tree (uncommitted) fails to resolve. `toAttachments` already reports that as an error, so the variant fails with a clear message.

### 4. Composer without a session

The Composer gets the props it really needs instead of a `session`: `directory`, `running: boolean`, `onSend(message): Promise<ComposerSendResult | void>`, and `hubCommands: boolean`. SessionView passes what it passes today, wrapped. The start page passes the chosen directory (the main checkout for "New worktree"), `running: false`, `hubCommands: false`, and an `onSend` that calls `POST chat`. The readiness check (`targetOf`) stays in the Composer. For "New worktree" it checks the project container, which is what creating a worktree needs.

### 5. Routes and the chat view

- `chat` (start page) and `chat/$projectId/$task`, both under `shellRoute`. They are not under `projectRoute`, so the project page chrome doesn't show.
- The chat view finds the task in the snapshot. It picks the first variant that wasn't discarded, as the task page's default does (Variant switcher). If that variant has a session, it renders `SessionView` in a centred, max-width column. If not, it shows the same starting/failed states as `TaskConversation`, via a small shared component taken out of `task-conversation.tsx`.
- Header: task title, project and checkout labels, and a "Open task" link to `taskPath(project, task)`.
- `/new` inside a chat: `onStarted(sessionId)` goes to the new session's manual task once the snapshot lists it (as `worktrees.tsx` does with `?session=`). A route helper looks up the task from the session id.
- After a start, navigate with `replace: true` from `/chat` to `/chat/:project/:task`, so Back doesn't land on an empty composer.

### 6. Sidebar and remembered project

A `NavItem to="/chat"` with a `MessageSquareIcon`, right after Overview, without `end`, so it is active on chat views too. Because the link always points to `/chat`, clicking it from a chat view opens a blank composer. The last project is stored in `localStorage` (`opendevhub.chat.project`), wrapped in try/catch, and ignored if the project is gone.

### 7. Styling

Tailwind + shadcn. The start page is a vertically centred column (`max-w-3xl`), with a short heading, the pickers as two shadcn `Select`s (or `Popover` + `Command` if the worktree list gets long), and the Composer below them. The chat view uses the same max width, so the composer doesn't jump sideways after the first send.

## Risks / Trade-offs

- [Two places show one conversation in full] → Both render the same `SessionView`. The spec change says so explicitly, and the chat view always links to the task page.
- [Mention typed against the main checkout misses in the new worktree] → It is resolved on the server at send time, and a miss fails the variant with a clear error (Decision 3). The usual case, committed files, works.
- [Extracting `resolveMessage` touches the composer send path] → It is covered by the existing `sessions` tests. Add a test for a task whose first turn is `/name args` with a mention.
- [Manual task title follows opencode's session title] → A chat in an existing checkout shows "Untitled" until opencode retitles it after the first turn. This is acceptable and matches other manual tasks.

## Open Questions

- Should the start composer later get a model picker like the New task dialog's variant row? This change leaves it out.
