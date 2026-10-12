import { userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { App } from "../../app";
import { projectOcrOwn } from "../../mocks/fixtures";
import { mockApi } from "../../mocks/story";

const meta = preview.meta({
  component: App,
  parameters: { route: "/p/acme-web" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Project settings" })
    );
  },
  title: "Projects/Open Code Review settings",
});

/** The project reviews with the default provider. */
export const UsesDefault = meta.story();

/** The project has its own model on DeepSeek, with the default key. */
export const OwnProvider = meta.story({
  beforeEach: mockApi({ projectOcr: projectOcrOwn }),
});
