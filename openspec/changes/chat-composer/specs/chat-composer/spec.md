## ADDED Requirements

### Requirement: Composer sends to a visible checkout

The Conversation tab SHALL have a composer for messaging the selected conversation. The composer SHALL show the project, the checkout (branch, or worktree name) and the environment that the message goes to. While that environment isn't running, the composer SHALL be disabled and say why. While the agent is working, a sent message SHALL be queued behind the current turn, as the message box does today.

#### Scenario: Composer names its target

- **WHEN** the user opens the Conversation tab of a task whose variant works in worktree `add-login-v1` of project `shop`
- **THEN** the composer shows `shop` and `add-login-v1` next to the message box

#### Scenario: Environment stopped

- **WHEN** the environment that serves the conversation's checkout is stopped
- **THEN** the composer is disabled and says the environment isn't running

### Requirement: Slash command suggestions

When a message starts with `/`, the composer SHALL suggest commands that match the text typed after the `/`. The suggestions SHALL include the opencode commands available in the conversation's checkout, each with its description, plus the hub commands `/new` (start a new conversation in the same checkout) and `/interrupt` (stop the running turn). Hub commands SHALL be marked as such. The user SHALL be able to move through suggestions with the arrow keys, choose one with Enter or Tab or a click, and close the list with Escape.

#### Scenario: Project command listed

- **WHEN** the checkout has an opencode command `opsx-propose` and the user types `/ops`
- **THEN** the composer suggests `opsx-propose` with its description

#### Scenario: Choosing a command

- **WHEN** the suggestions are open and the user presses Enter on `opsx-propose`
- **THEN** the message reads `/opsx-propose ` and the cursor sits after it

#### Scenario: Slash inside text

- **WHEN** the user types `/` after other text in the message
- **THEN** no command suggestions open

### Requirement: Sending a slash command

When the user sends a message that starts with `/name` and `name` is an opencode command available in the checkout, the hub SHALL run that command in the conversation with the rest of the message as its arguments, not send the text as a prompt. A hub command SHALL be handled by opendevhub and not sent to opencode. A message that starts with `/` followed by an unknown name SHALL be sent as a plain prompt.

#### Scenario: Running an opencode command

- **WHEN** the user sends `/opsx-propose add dark mode`
- **THEN** the conversation runs the `opsx-propose` command with the arguments `add dark mode`

#### Scenario: Interrupting

- **WHEN** the agent is working and the user sends `/interrupt`
- **THEN** the running turn stops and nothing is sent to the agent

#### Scenario: Unknown command

- **WHEN** the user sends `/etc/hosts is wrong`
- **THEN** the text is sent as a prompt

### Requirement: Mention suggestions

When the user types `@` at the start of the message or after whitespace, the composer SHALL suggest files in the conversation's checkout and the project's agents that match the text typed after the `@`, with files and agents in separate groups. File suggestions SHALL come from the checkout the conversation works in, never from another checkout or from outside the checkout. Choosing a suggestion SHALL insert the mention as a token that the user can delete as one unit.

#### Scenario: File mention

- **WHEN** the user types `@login` in a checkout containing `src/auth/login.ts`
- **THEN** the composer suggests `src/auth/login.ts` under Files

#### Scenario: Agent mention

- **WHEN** the project has an agent `reviewer` and the user types `@rev`
- **THEN** the composer suggests `reviewer` under Agents

#### Scenario: Email address

- **WHEN** the user types `tim@example.com`
- **THEN** no mention suggestions open

### Requirement: Sending mentions

A message with mentions SHALL reach the agent in the form opencode v2 understands natively for that kind of mention (a file or agent part of the prompt when the API offers one, plain text otherwise), so the agent sees the file or is handed to the agent just as when the same thing is typed in opencode's own interface.

#### Scenario: File mentioned in a prompt

- **WHEN** the user sends `explain @src/auth/login.ts`
- **THEN** the agent receives the prompt with `src/auth/login.ts` referenced as opencode's own interface would reference it

### Requirement: Checkout-scoped lookup routes

The hub SHALL provide routes, per project and checkout directory, that list the checkout's commands, search its files by a query and list its agents. Each route SHALL reject a directory that isn't one of the project's checkouts. Results SHALL be capped so a large repository doesn't slow down the composer.

#### Scenario: Directory outside the project

- **WHEN** a request asks for files in a directory that isn't a checkout of the project
- **THEN** the hub rejects the request and searches nothing

#### Scenario: Large repository

- **WHEN** a file search matches thousands of files
- **THEN** the hub returns at most the capped number of best matches
