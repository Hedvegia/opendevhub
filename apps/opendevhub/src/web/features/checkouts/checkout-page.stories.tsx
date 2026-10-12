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
export const Tasks = meta.story();

export const MainCheckout = meta.story({
  parameters: { route: "/p/acme-web/main" },
});

/** Changed files, diffs, checks and the commit / publish actions. */
export const Changes = meta.story({
  parameters: { route: "/p/acme-web/main/review" },
});

/** One conversation: its transcript with the composer pinned to the bottom, and the usage button in its header. */
export const Conversation = meta.story({
  parameters: { route: "/p/acme-web/t/tsk_rate" },
});

/** The Turns panel beside the transcript, the newest turn with its changes open. */
export const ConversationTurns = meta.story({
  beforeEach: () => {
    localStorage.setItem("opendevhub.conversation.panel", "turns");
    return () => localStorage.removeItem("opendevhub.conversation.panel");
  },
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
