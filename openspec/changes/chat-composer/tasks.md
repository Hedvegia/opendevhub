## 1. Confirm the opencode v2 API (do this first; nothing else starts until it's written down)

- [ ] 1.1 Start a project environment and record the opencode version that its `opencode serve` reports
- [ ] 1.2 Fetch that server's API description (its OpenAPI document if it serves one, otherwise the opencode source at that version) and check what it offers for listing commands (argument hints, source), running commands (text or parts), file search, agents (which ones can be mentioned), prompt input parts (text, file, agent) and message-part events
- [ ] 1.3 Find how opencode's own TUI sends `@file` and `@agent` in a prompt (the request body it sends)
- [ ] 1.4 Add an "opencode v2 API" section to design.md, listing each endpoint and shape with the version checked, and mark every gap the hub has to fill itself
- [ ] 1.5 Update the tasks below to match: drop any hub-side work that opencode already covers, and add a fallback task only for a gap that's confirmed

## 2. Server: opencode client

- [ ] 2.1 Add file search to `OpencodeClient` using the endpoint recorded in 1.4 (or, only if 1.4 found none, a `git ls-files` fallback run through the container's exec path), capped at 50 results
- [ ] 2.2 Let `prompt` take input parts (file, agent) in the shape recorded in 1.4, with mention conversion in one function
- [ ] 2.3 Add contract tests for the new client calls against the shapes recorded in 1.4

## 3. Server: lookup and send routes

- [ ] 3.1 Add `Sessions` methods for a checkout's commands, agents and file search. Each calls `checkDirectory`; commands and agents get a cache with the same TTL and invalidation as `modelCache`
- [ ] 3.2 Add a send method that classifies a message as a hub command (`/new`, `/interrupt`), a known opencode command (`client.command`) or a prompt (with mention parts). Unknown `/name` text is sent as a prompt
- [ ] 3.3 Expose the lookup and send routes in the dashboard API and add their request and response types to `src/shared/types.ts`
- [ ] 3.4 Add tests: a directory outside the project is rejected, the file-search cap is enforced, each message kind is classified correctly, `/interrupt` sends nothing to the agent

## 4. Web: composer

- [ ] 4.1 Add the shadcn `popover` component
- [ ] 4.2 Build the composer component: a textarea plus a cmdk suggestion list anchored to the caret. `/` triggers only at the start of the message and `@` only at the start or after whitespace; arrow keys, Enter, Tab and Escape apply while the list is open; Ctrl+Enter still sends
- [ ] 4.3 Show command suggestions (opencode commands with descriptions, hub commands marked) and mention suggestions (Files and Agents groups, file search debounced 150 ms)
- [ ] 4.4 Track mentions as text ranges that are deleted as one unit, and send `{ text, mentions }` to the send route
- [ ] 4.5 Add the target line (project, checkout, environment status) and disable the composer with a reason while the environment isn't running
- [ ] 4.6 Add combobox ARIA: `role`, `aria-expanded`, `aria-controls`, `aria-activedescendant`
- [ ] 4.7 Replace `PromptForm` in `session-page.tsx` with the composer, keeping the queued and sent notices
- [ ] 4.8 Add Storybook stories: idle, command list open, mention list open, environment stopped

## 5. Verify

- [ ] 5.1 Run `pnpm exec ultracite fix`, the type check and the test suites
- [ ] 5.2 In the running app, run a project's opencode command from `/`, send a prompt with an `@file` and an `@agent`, and use `/interrupt` during a turn
- [ ] 5.3 Run `graphify update .`
