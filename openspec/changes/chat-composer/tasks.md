## 1. Confirm the opencode v2 API (do this first; nothing else starts until it's written down)

- [x] 1.1 Start a project environment and record the opencode version that its `opencode serve` reports
- [x] 1.2 Fetch that server's API description (its OpenAPI document if it serves one, otherwise the opencode source at that version) and check what it offers for listing commands (argument hints, source), running commands (text or parts), file search, agents (which ones can be mentioned), prompt input parts (text, file, agent) and message-part events
- [x] 1.3 Find how opencode's own TUI sends `@file` and `@agent` in a prompt (the request body it sends)
- [x] 1.4 Add an "opencode v2 API" section to design.md, listing each endpoint and shape with the version checked, and mark every gap the hub has to fill itself
- [x] 1.5 Update the tasks below to match: drop any hub-side work that opencode already covers, and add a fallback task only for a gap that's confirmed

## 2. Server: opencode client

- [x] 2.1 Add `findFiles(directory, query)` to `OpencodeClient` over `GET /api/fs/find?type=file&limit=50` (no hub fallback: opencode 2.0.26 has it and honours `.gitignore`)
- [x] 2.2 Let `prompt` and `command` take `files` and `agents` attachments (`{ uri, name, mention }`, `{ name, mention }`), with mention conversion (checkout-relative path → `file://` URI, ranges → `Mention`) in one function that refuses paths outside the checkout
- [x] 2.3 Add contract tests for `findFiles`, prompt and command bodies with attachments, against the shapes recorded in 1.4

## 3. Server: lookup and send routes

- [x] 3.1 Add `Sessions` methods for a checkout's commands, mentionable agents (`!hidden && mode !== "primary"`, as the TUI) and file search. Each calls `checkDirectory`; commands and agents get a cache with the same TTL and invalidation as `modelCache`
- [x] 3.2 Add a send method that classifies a message as a hub command (`/new`, `/interrupt`), a known opencode command (`client.command`) or a prompt, both with mention attachments. Unknown `/name` text is sent as a prompt
- [x] 3.3 Expose the lookup and send routes in the dashboard API and add their request and response types to `src/shared/types.ts`
- [x] 3.4 Add tests: a directory outside the project is rejected, the file-search cap is enforced, each message kind is classified correctly, `/interrupt` sends nothing to the agent

## 4. Web: composer

- [x] 4.1 Add the shadcn `popover` component
- [x] 4.2 Build the composer component: a textarea plus a cmdk suggestion list anchored to the caret. `/` triggers only at the start of the message and `@` only at the start or after whitespace; arrow keys, Enter, Tab and Escape apply while the list is open; Ctrl+Enter still sends
- [x] 4.3 Show command suggestions (opencode commands with descriptions, hub commands marked) and mention suggestions (Files and Agents groups, file search debounced 150 ms)
- [x] 4.4 Track mentions as text ranges that are deleted as one unit, and send `{ text, mentions }` to the send route
- [x] 4.5 Add the target line (project, checkout, environment status) and disable the composer with a reason while the environment isn't running
- [x] 4.6 Add combobox ARIA: `role`, `aria-expanded`, `aria-controls`, `aria-activedescendant`
- [x] 4.7 Replace `PromptForm` in `session-page.tsx` with the composer, keeping the queued and sent notices
- [x] 4.8 Add Storybook stories: idle, command list open, mention list open, environment stopped

## 5. Verify

- [x] 5.1 Run `pnpm exec ultracite fix`, the type check and the test suites
- [ ] 5.2 In the running app, run a project's opencode command from `/`, send a prompt with an `@file` and an `@agent`, and use `/interrupt` during a turn
- [x] 5.3 Run `graphify update .`
