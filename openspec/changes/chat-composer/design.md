## Context

A conversation is an opencode session in one project's environment. `Sessions` resolves every call through `requireProject`, `checkDirectory` and `envForDirectory`, then talks to that environment's opencode v2 server over `OpencodeClient` (`src/server/opencode/client.ts`). The runtime refuses opencode older than v2 (`src/server/opencode/runtime.ts`), but it doesn't pin a minor version, so environments can run different v2 builds.

What exists today:

- `OpencodeClient.commands(directory)` (`GET /api/command`) and `command(sessionId, name, text)` (`POST /api/session/:id/command`). Tasks already use both for spec-first variants.
- `agents(directory)` (`GET /api/agent`) and `models(directory)`, cached per project for a minute in `Sessions`.
- `prompt(sessionId, text, delivery)` sends only text: there are no file or agent parts.
- `interrupt(sessionId)`.
- No file search.
- The Conversation tab's `PromptForm` (`session-page.tsx`) is a `Textarea` that sends with Ctrl+Enter and queues while the agent is running.
- shadcn `command.tsx` (cmdk) is installed. `popover.tsx` is not.

The client's methods were written against the endpoints opendevhub needed so far. Nobody has checked what else opencode v2 offers for a chat client: file search, prompt parts, mention syntax, or a command that takes structured arguments.

## Goals / Non-Goals

**Goals:**

- `/` and `@` suggestions in the Conversation tab, scoped to the conversation's checkout.
- Reuse opencode v2's own endpoints and prompt shapes wherever they exist. The hub adds only routing, project scoping and the two hub commands.
- Make the target project and checkout impossible to miss.

**Non-Goals:**

- A streamed, part-by-part transcript (the follow-up change).
- Attachments uploaded from the browser (images, pasted files).
- Hub commands beyond `/new` and `/interrupt`. A model picker belongs with the transcript change or a later one.
- A composer outside a task, e.g. on the dashboard. Conversations stay inside tasks.

## Decisions

### 1. Check the opencode v2 API first and write it down

Before any other task, a running environment's opencode v2 server is queried for its API description (its OpenAPI document if it serves one, otherwise its source at the installed version). The results go into an "opencode v2 API" section added to this file. For each of these, the section records the endpoint, its request and response shape, and the opencode version checked:

- listing commands, and whether they carry an argument hint or the source (project, global, built-in)
- running a command, and whether it accepts parts as well as text
- file search (e.g. a find-file endpoint): query parameters, whether it honours `.gitignore`, any limit
- listing agents, and which ones are meant to be mentioned (subagents vs primary agents)
- prompt input parts: text, file (by path or URL), agent. This includes how opencode's own TUI encodes `@file` and `@agent` when it sends a prompt.
- the event stream's message-part events (written down for the follow-up change, not used here)

Every later task names the endpoint it uses from that section. If opencode provides something, the hub calls it and doesn't rebuild it. The hub keeps its own fallback only where the API check finds a gap. For file search, that fallback is `git ls-files` run in the container through the existing exec path.

_Alternative:_ build against what `client.ts` already does and find the gaps as we go. That risks writing a hub-side file search, or a text convention for mentions, that duplicates or contradicts what opencode already does natively.

### 2. Send through one hub route that classifies the message

The composer posts `{ text, mentions }` to a single send route. The server decides what to do:

- a hub command: handled by the hub
- `/name` matching a command listed for the checkout: `client.command`
- anything else: `client.prompt`, with parts if the API check found prompt parts

The browser never chooses the opencode endpoint.

_Why:_ the command list is per checkout and can change. The server already lists it to validate commands for tasks. One route keeps the queue/steer behaviour in one place.

_Alternative:_ the browser calls separate prompt and command routes. That duplicates validation and makes the behaviour for unknown `/` text drift.

### 3. Lookup routes go through `Sessions` and reuse its caching

`commands` and `agents` are cached per project and directory with the same TTL and invalidation as `modelCache`. File search is not cached: each query hits opencode, or the fallback, with a result cap (50) and a debounce in the browser (150 ms). Every route calls `checkDirectory` first.

### 4. The composer is a `Textarea` plus a cmdk list in a popover

The composer adds shadcn `popover`, anchored to the textarea's caret. The textarea keeps focus. Arrow keys, Enter, Tab and Escape are intercepted only while the list is open, so Ctrl+Enter still sends. The textarea has `role="combobox"` with `aria-expanded`, `aria-controls` and `aria-activedescendant` pointing at the cmdk list.

Mentions are tracked as ranges over the plain text, not as a rich-text editor. Backspace at the end of a range deletes the whole mention. The ranges are sent alongside the text.

_Alternative:_ a contenteditable or rich-text editor such as Lexical or TipTap. It's heavier, harder to make accessible, and not needed for inline tokens.

### 5. The target is shown in the composer, not only in the page header

A line above the textarea shows the project, the checkout (branch or worktree name) and an environment status dot, built from the task context the tab already has. The composer is disabled, with a reason, unless the environment is running.

## Risks / Trade-offs

- Environments run different opencode v2 builds, so an endpoint can exist in one and not another → the API check records the version, and the hub feature-detects (a 404 on file search uses the fallback) instead of assuming.
- Opencode's mention encoding may change between v2 releases → keep the conversion in one function in `client.ts`, covered by a contract test against the recorded shape.
- File search on large repositories → server-side cap, browser debounce, and no hub cache that could go stale.
- Hub command names could collide with opencode commands → a hub command wins. The suggestion list marks hub commands and still shows the shadowed opencode command, greyed out with a note.

## Open Questions

- Does opencode v2 expose file search at all, and does it honour `.gitignore`? (Answered by the API check.)
- Should `@agent` hand the turn to that agent (as opencode's TUI does), or only mention it in the text? Follow opencode's behaviour once the API check shows it.
