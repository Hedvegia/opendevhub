## 1. Shared message resolution

- [ ] 1.1 Extract `resolveMessage(client, directory, request)` from `Sessions.sendMessage` (`/name` → command + args when the checkout has it; mentions → attachments; otherwise a prompt), and use it in `sendMessage`
- [ ] 1.2 Add optional `message?: ComposerSendRequest` to `TaskRequest` and its parser (`server/tasks/request.ts`); reject `/new` and `/interrupt` as a first message
- [ ] 1.3 In `firstTurn` / `startVariant`, send a `message` through `resolveMessage` against the variant's directory (command or prompt, with attachments)
- [ ] 1.4 Tests: a task whose first message is `/opsx-propose add x @src/a.ts` runs the command with the attachment; an unknown `/name` is sent as a prompt

## 2. Chat start route

- [ ] 2.1 Add `ChatStartRequest` / `ChatStartResult` to `shared/types.ts`
- [ ] 2.2 Add `POST /p/:project/chat`: for `worktree`, start a one-variant task with defaults, a derived title and the `message`; for `checkout`, validate the directory, `startSession` without a prompt, `sendMessage`, and return the manual task id
- [ ] 2.3 Add `startChat` to `web/api.ts`
- [ ] 2.4 Tests: both targets return a task id; a directory outside the project is rejected; a hub command as the first message is rejected

## 3. Composer without a session

- [ ] 3.1 Change `Composer` to take `directory`, `running`, `hubCommands` and `onSend` instead of `session`; hide `/new` and `/interrupt` when `hubCommands` is false
- [ ] 3.2 Update `SessionView` to pass these props; check that the Conversation tab behaves as before
- [ ] 3.3 Update `composer.stories.tsx`, and add a start-composer story

## 4. Chat pages

- [ ] 4.1 Add `features/chat/chat-start.tsx`: centred layout, project picker (last project from `localStorage`, else first by name), checkout picker (New worktree / main / existing worktrees, New worktree disabled with a reason when worktrees aren't mounted), the Composer, an empty state when no project is registered, and navigation with `replace` to the chat view on success
- [ ] 4.2 Take the starting/failed/removed states out of `task-conversation.tsx` into a shared component
- [ ] 4.3 Add `features/chat/chat-view.tsx`: look up the task and its default variant, show a header (title, project, checkout, Open task link), `SessionView` in a max-width column or the starting states, a not-found state linking to `/chat`, and handle `/new` by opening the new conversation's chat view
- [ ] 4.4 Register routes `chat` and `chat/$projectId/$task` in `web/app.tsx`
- [ ] 4.5 Stories for the start page (default, worktrees unavailable, no projects) and the chat view (starting, conversation)

## 5. Sidebar

- [ ] 5.1 Add a Chat `NavItem` (`MessageSquareIcon`) after Overview in `AppSidebar`, active on `/chat` and its views
- [ ] 5.2 Test that clicking Chat on a chat view opens an empty `/chat`

## 6. Wrap-up

- [ ] 6.1 Run `pnpm exec ultracite fix`, type-check and the test suite
- [ ] 6.2 Try both targets in the running app: new worktree with a prompt, main checkout with a slash command
- [ ] 6.3 Run `graphify update .`
