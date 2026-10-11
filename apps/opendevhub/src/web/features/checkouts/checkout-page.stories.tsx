import preview from "../../../../.storybook/preview";
import { App } from "../../app";
import { failing, pending } from "../../mocks/handlers";
import { mockApi } from "../../mocks/story";

const meta = preview.meta({
  component: App,
  parameters: { route: "/p/acme-web/w/dark-mode" },
  title: "Pages/Checkout",
});

/** A worktree no task created: the tasks whose conversations run there. */
export const Conversations = meta.story();

export const MainCheckout = meta.story({
  parameters: { route: "/p/acme-web/main" },
});

/** Changed files, diffs, checks and the commit / publish actions. */
export const Changes = meta.story({
  parameters: { route: "/p/acme-web/main/review" },
});

/** One conversation: its usage, its turns (the newest with its changes open) and its subagents. */
export const Conversation = meta.story({
  parameters: { route: "/p/acme-web/t/tsk_rate" },
});

export const ConversationLoading = meta.story({
  beforeEach: mockApi(
    {},
    pending("get", "/api/projects/:id/sessions/:session")
  ),
  parameters: { route: "/p/acme-web/t/tsk_rate" },
});

export const ChangesLoading = meta.story({
  beforeEach: mockApi({}, pending("get", "/api/projects/:id/review")),
  parameters: { route: "/p/acme-web/main/review" },
});

export const ChangesError = meta.story({
  beforeEach: mockApi(
    {},
    failing("get", "/api/projects/:id/review", "fatal: bad revision 'main'")
  ),
  parameters: { route: "/p/acme-web/main/review" },
});

/** An old session link: lands on the session's task, variant selected. */
export const OldSessionLink = meta.story({
  parameters: { route: "/p/acme-web/w/rate-limit/s/ses_perm01" },
});

/** Ports, container state and logs. */
export const Runtime = meta.story({
  parameters: { route: "/p/acme-web/main/runtime" },
});

/** A worktree that runs in its own container. */
export const IsolatedWorktree = meta.story({
  parameters: { route: "/p/acme-web/w/dark-mode" },
});
