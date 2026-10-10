import { http, HttpResponse } from "msw";
import { userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { App } from "../../app";
import { failing, pending } from "../../mocks/handlers";
import { mockApi } from "../../mocks/story";

const meta = preview.meta({
  component: App,
  parameters: { route: "/?settings=activity" },
  title: "Settings/Activity",
});

/** Everything across projects, newest first: tasks started, a variant failing, a branch published, a review run. */
export const AllProjects = meta.story();

/** The project overview's header button opens that project's activity in a dialog. */
export const ProjectDialog = meta.story({
  parameters: { route: "/p/acme-web" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Activity" })
    );
  },
});

export const Empty = meta.story({
  beforeEach: mockApi(
    {},
    http.get("/api/activity", () => HttpResponse.json({ events: [] }))
  ),
});

export const Loading = meta.story({
  beforeEach: mockApi({}, pending("get", "/api/activity")),
});

export const LoadError = meta.story({
  beforeEach: mockApi(
    {},
    failing("get", "/api/activity", "the activity log is not available")
  ),
});
