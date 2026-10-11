import { expect, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { App } from "../../app";
import { snapshot, webProject } from "../../mocks/fixtures";
import { mockApi } from "../../mocks/story";

const noWorktreeMount = {
  ...webProject,
  runtime: {
    ...webProject.runtime,
    worktreeRoot: webProject.runtime.worktreeRoot && {
      ...webProject.runtime.worktreeRoot,
      mounted: false,
    },
  },
};

const meta = preview.meta({
  component: App,
  parameters: { route: "/chat" },
  title: "Pages/Chat/Start",
});

/** An empty page with the composer in the middle; the pickers say where the chat runs. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("combobox", { name: "Checkout" })
    ).toHaveTextContent("New worktree");
    await expect(
      canvas.getByRole("combobox", { name: "Message the agent" })
    ).toBeEnabled();
  },
});

/** The project's container has no worktrees folder: the main checkout is chosen, and the page says why. */
export const WorktreesUnavailable = meta.story({
  beforeEach: mockApi({
    snapshot: { ...snapshot, projects: [noWorktreeMount] },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("combobox", { name: "Checkout" })
    ).toHaveTextContent("Main checkout");
    await expect(
      canvas.getByText(/rebuild it to enable worktrees/iu)
    ).toBeVisible();
  },
});

/** No project is registered yet: the page offers to add one. */
export const NoProjects = meta.story({
  beforeEach: mockApi({ snapshot: { ...snapshot, projects: [] } }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("button", { name: "Add project" })
    ).toBeVisible();
  },
});
