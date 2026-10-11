# chat-tab Specification

## Purpose

TBD - created by archiving change chat-tab. Update Purpose after archive.

## Requirements

### Requirement: Chat in the sidebar

The sidebar's main navigation SHALL have a Chat entry that opens `/chat`. The entry SHALL be marked active on `/chat` and on every chat view under it. Choosing Chat SHALL always open an empty start composer, even when a chat view is open.

#### Scenario: Opening Chat

- **WHEN** the user clicks Chat in the sidebar
- **THEN** the browser opens `/chat` and shows the start composer

#### Scenario: New chat from a chat

- **WHEN** the user is on `/chat/shop/abc` and clicks Chat
- **THEN** the browser opens `/chat` with an empty composer

### Requirement: Start composer

The page `/chat` SHALL show the composer centred on the page, with a project picker and a checkout picker next to it and no conversation. The project picker SHALL list the registered projects. Its default SHALL be the project the user last chatted in on this browser, or else the first project by name. The checkout picker SHALL offer "New worktree", the main checkout and each of the project's existing worktrees, labelled by branch or worktree name. Its default SHALL be "New worktree" when the project can create worktrees, and the main checkout otherwise. When no project is registered, the page SHALL say so and offer to add one.

#### Scenario: Default target

- **WHEN** the user opens `/chat`, last chatted in `shop`, and `shop` can create worktrees
- **THEN** the pickers show `shop` and "New worktree"

#### Scenario: Worktrees not available

- **WHEN** the chosen project's container has no worktree mount
- **THEN** "New worktree" is disabled with the reason, and the main checkout is selected

#### Scenario: Existing worktree listed

- **WHEN** the project `shop` has worktree `add-login-v1`
- **THEN** the checkout picker offers `add-login-v1`

### Requirement: Start composer suggestions and readiness

The start composer SHALL offer the same `/` command and `@` mention suggestions as the Conversation tab's composer. They SHALL be scoped to the chosen checkout. For "New worktree" they SHALL be scoped to the main checkout. While the environment that would serve the chosen checkout isn't running, the composer SHALL be disabled and say why. Hub commands that need an existing conversation (`/new`, `/interrupt`) SHALL NOT be suggested in the start composer.

#### Scenario: Commands for a new worktree

- **WHEN** "New worktree" is chosen in project `shop`, whose main checkout has the command `opsx-propose`, and the user types `/ops`
- **THEN** the composer suggests `opsx-propose`

#### Scenario: Stopped environment

- **WHEN** the chosen existing worktree's container is stopped
- **THEN** the start composer is disabled and says the worktree's container isn't running

### Requirement: First message starts a task

Sending the first message SHALL start the chat in the chosen checkout. The first message SHALL be handled like a message sent from the Conversation tab's composer: a `/name` of a known opencode command runs that command with the rest as arguments, mentions go along as attachments, and anything else is a prompt.

- For "New worktree", the hub SHALL create a task of kind `task` with one variant on the project's default model and agent, in a new worktree with the project's default environment. The task's title SHALL be derived from the message text, as the New task dialog derives it. The first message SHALL be sent once the variant's conversation exists.
- For the main checkout or an existing worktree, the hub SHALL start a new conversation in that checkout. The conversation SHALL belong to a manual task, and the first message SHALL be sent to it.

After the hub accepts the message, the browser SHALL open `/chat/:project/:task`, replacing `/chat` in the history. The chosen project SHALL be remembered on this browser as the last chatted-in project.

#### Scenario: Prompt in a new worktree

- **WHEN** the user sends `add a dark mode toggle` with project `shop` and "New worktree"
- **THEN** a task titled from the message is created in a new worktree of `shop`, the browser opens its chat view, and the agent receives the prompt once the worktree's conversation has started

#### Scenario: Command in the main checkout

- **WHEN** the user sends `/opsx-propose add dark mode` with the main checkout of `shop`
- **THEN** a new conversation in the main checkout runs `opsx-propose` with the arguments `add dark mode`, and it belongs to a manual task

#### Scenario: Start fails

- **WHEN** the worktree cannot be created
- **THEN** the chat view shows the variant's failure as the task page does, and the task stays listed under Tasks

#### Scenario: Request rejected

- **WHEN** the hub rejects the start (for example, the chosen directory isn't a checkout of the project)
- **THEN** the start composer stays on `/chat` with the message kept and shows the error

### Requirement: Chat view

The page `/chat/:project/:task` SHALL show the task's conversation full-width: pending permission and question cards, the turns, and the composer at the bottom. The composer SHALL behave as the Conversation tab's composer, including `/new` and `/interrupt`. A header SHALL name the task, the project and the checkout, and SHALL link to the task page. Until the conversation exists, the view SHALL show how far the variant has got, as the Conversation tab does. A task with more than one variant SHALL show its first variant that was not discarded. When the task or project doesn't exist, the page SHALL say so and link to `/chat`.

#### Scenario: Going to the task's changes

- **WHEN** the user is in a chat whose task works in worktree `dark-mode` and follows the header's task link
- **THEN** the task page opens, where Changes, Terminal and Runtime show `dark-mode`

#### Scenario: Worktree still starting

- **WHEN** the chat view opens while the new worktree's container is starting
- **THEN** the view shows the starting step instead of the conversation, and the conversation replaces it once it starts

#### Scenario: `/new` in a chat

- **WHEN** the user sends `/new` in a chat view
- **THEN** a new conversation starts in the same checkout and the browser opens that conversation's chat view

#### Scenario: Unknown task

- **WHEN** the user opens `/chat/shop/missing`
- **THEN** the page says the chat was not found and links to `/chat`
