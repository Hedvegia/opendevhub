## Why

To start working with an agent today, you open a project, open New task, fill in a dialog and then land on a task page with tabs. Popular agent apps start with one empty message box in the middle of the screen. You type, and the conversation runs right there. opendevhub has no quick path like that, even though the composer (`/` commands, `@` mentions) and the conversation view already exist.

## What Changes

- Add a **Chat** entry to the sidebar's main navigation. It opens `/chat`, an empty page with the composer centred in it, like popular agents.
- Above the composer, two pickers choose where the chat runs: the **project**, and the **checkout**. The checkout is a new worktree (the default), the main checkout, or one of the project's existing worktrees.
- The start composer is the existing Composer. `/` commands and `@` mentions come from the chosen checkout. For a new worktree, they come from the main checkout, which the new worktree branches from.
- Sending the first message creates a task and keeps the user in Chat:
  - New worktree: a task of kind `task` with one variant on the project's defaults. Its title comes from the message.
  - Main checkout or existing worktree: a new conversation in that checkout, which belongs to a manual task as every conversation started by opendevhub does.
  - The page moves to `/chat/:project/:task` and shows the conversation full-width: its turns, pending cards and the composer at the bottom. A header names the project and checkout and links to the task page for Changes, Terminal and Runtime.
- The first message goes through the same send path as later ones. A first message such as `/opsx-propose add dark mode`, or one with `@file` mentions, works the same way it does in the Conversation tab.
- Clicking Chat again opens a fresh, empty composer. Chat keeps no history list of its own. Earlier chats are tasks, found under Tasks and ⌘K.
- **Exception to "tasks start inside a project"**: Chat is the one place outside a project that starts a task with a project picker.

## Capabilities

### New Capabilities

- `chat-tab`: the sidebar's Chat page: the centred start composer with project and checkout pickers, what the first message creates, and the full-width chat view at `/chat/:project/:task`.

### Modified Capabilities

- `task-navigation`: "Tasks start inside a project" allows Chat as an entry point with its own project picker. "Conversation tab" is no longer the only place that shows one conversation in full: the Chat view shows it too, with the same content.

## Impact

- Web: new `src/web/features/chat/` (start page, chat view, pickers), routes `chat` and `chat/$projectId/$task` in `src/web/app.tsx`, and a Chat item in `AppSidebar` (`src/web/shell/shell.tsx`). The Composer (`features/sessions/composer.tsx`) gets a mode with no session yet: the caller picks the checkout and handles the send.
- Server: a route that starts a chat. It takes a project, a target (new worktree, or an existing checkout directory) and a `ComposerSendRequest`, then creates the task or session and sends the first message through `sendMessage`. For a new worktree, the message waits until the variant's session exists.
- Shared: `src/shared/types.ts` (chat start request/result).
- No migrations. No new dependencies.
