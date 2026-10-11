## Why

The Conversation tab's message box is a plain textarea: it can only send prompt text. You can't run opencode's slash commands (the project's own ones included, such as the OpenSpec commands), point the agent at a file, or pick an agent from it. You have to know names by heart or leave opendevhub. The server can already list and run slash commands (tasks use them), so the gap is mostly the composer.

## What Changes

- Replace the Conversation tab's textarea with a chat composer that opens a suggestion popover on `/` (at the start of the message) and `@` (anywhere), driven by the keyboard and the mouse.
- `/` suggests the opencode commands available in the conversation's checkout and a small set of hub commands that opendevhub handles itself (`/new`, `/interrupt`). Sending `/name args` runs the opencode command rather than sending the text as a prompt.
- `@` suggests files in the conversation's worktree and the project's agents. A chosen mention is sent in whatever form opencode v2 understands natively (a file part, an agent part, or plain text), as found in the API check.
- The composer always shows which project, checkout (branch or worktree) and environment it sends to, and stays disabled with a reason while that environment isn't running.
- New server routes list a checkout's commands, search its files and list its agents, each scoped to a project and a directory inside it.
- Before anything is built, the opencode v2 API that the running environments serve is checked and written down. Every later task uses what opencode already provides (command listing and running, file search, agents, prompt parts) instead of building it in the hub.
- Out of scope: the full streamed transcript (message parts and tool calls rendered live). That is the follow-up change.

## Capabilities

### New Capabilities

- `chat-composer`: the Conversation tab's composer: `/` commands, `@` mentions, showing the project and checkout it sends to, and how a message is sent.

### Modified Capabilities

(none: the Conversation tab keeps its requirements; the composer is added within it)

## Impact

- Web: `src/web/features/sessions/session-page.tsx` (prompt form replaced), a new composer component under `src/web/features/sessions/`, shadcn `command` and `popover` components if they aren't installed yet.
- Server: `src/server/opencode/client.ts` (file search, plus prompt parts if the API check calls for them), `src/server/sessions/sessions.ts` (commands, files and agents per checkout, a command send path), dashboard API routes.
- Shared: `src/shared/types.ts` (suggestion and send-request types).
- Depends on opencode v2 in each environment (the runtime already refuses anything older). No migrations.
