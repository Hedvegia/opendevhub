import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { App } from "../../app";

const PANEL_KEY = "opendevhub.conversation.panel";

const meta = preview.meta({
  // Each story starts with the side panels closed, whatever an earlier one opened.
  beforeEach: () => {
    localStorage.removeItem(PANEL_KEY);
    return () => localStorage.removeItem(PANEL_KEY);
  },
  component: App,
  parameters: { route: "/chat/acme-web/tsk_rate" },
  title: "Pages/Chat/View",
});

/** The task's conversation full-width: the transcript, the permission card and the composer at the bottom. */
export const Conversation = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("link", { name: /open task/iu })
    ).toHaveAttribute("href", "/p/acme-web/t/tsk_rate");
    // The first prompt opens the transcript; the newest is near the composer.
    await expect(
      await canvas.findByText(
        "Read the rate limiter and explain how it counts requests"
      )
    ).toBeVisible();
    await expect(canvas.getByText("6 tool calls")).toBeInTheDocument();
    await expect(canvas.queryByText("Cost")).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("combobox", { name: "Message the agent" })
    ).toBeVisible();
  },
});

/** The usage button opens a popover with the conversation's cost, tokens and context. */
export const Usage = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /^usage/iu })
    );
    const popover = within(canvasElement.ownerDocument.body);
    await expect(await popover.findByText("Cost")).toBeVisible();
    await expect(
      popover.getByRole("meter", { name: "Context window used" })
    ).toBeInTheDocument();
  },
});

/** The agent asks a question: its card sits right above the composer. */
export const Question = meta.story({
  parameters: { route: "/chat/acme-web/tsk_form" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Which store should back the limiter?")
    ).toBeVisible();
  },
});

/** Opening, switching and closing the side panels from the rail. */
export const SidePanels = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const turns = await canvas.findByRole("button", { name: "Turns" });
    await userEvent.click(turns);
    await expect(
      await canvas.findByRole("complementary", { name: "Turns" })
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Subagents" }));
    await expect(
      await canvas.findByText("Find where requests are counted")
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Close Subagents" })
    );
    await expect(
      canvas.queryByRole("complementary", { name: "Subagents" })
    ).not.toBeInTheDocument();
  },
});

/** On a phone the Turns panel opens as a sheet over the transcript. */
export const MobileSheet = meta.story({
  globals: { viewport: { isRotated: false, value: "mobile1" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Turns" }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("dialog")).toBeVisible();
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
