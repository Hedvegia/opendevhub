import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { App } from "../../app";

const meta = preview.meta({
  component: App,
  parameters: { route: "/chat/acme-web/tsk_rate" },
  title: "Pages/Chat/View",
});

/** The task's conversation full-width, under a header that links to the task page. */
export const Conversation = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("link", { name: /open task/iu })
    ).toHaveAttribute("href", "/p/acme-web/t/tsk_rate");
  },
});

/** The new worktree is still being set up: the view shows how far it got instead of a conversation. */
export const Starting = meta.story({
  parameters: { route: "/chat/acme-web/tsk_search" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("No conversation yet")).toBeVisible();
  },
});

/** A task that doesn't exist: the page says so and offers a new chat. */
export const NotFound = meta.story({
  parameters: { route: "/chat/acme-web/missing" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Chat not found")).toBeVisible();
  },
});

/** Chat in the sidebar always opens an empty start composer, even from a chat. */
export const NewChatFromSidebar = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("link", { name: "Chat" }));
    await expect(
      await canvas.findByRole("heading", {
        name: /what shall we build/iu,
      })
    ).toBeVisible();
    await expect(
      canvas.getByRole("combobox", { name: "Message the agent" })
    ).toHaveValue("");
  },
});
