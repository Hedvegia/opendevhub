import { userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { App } from "../../app";
import { ocrSettingsEmpty } from "../../mocks/fixtures";
import { mockApi } from "../../mocks/story";

const meta = preview.meta({
  component: App,
  parameters: { route: "/forgejo/acme/web/42" },
  title: "Pages/Forgejo/Open Code Review",
});

const openMenu = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole("button", { name: /AI review/u })
  );
};

/** The AI review button is a menu: the agent review, or Open Code Review. */
export const Menu = meta.story({
  play: ({ canvasElement }) => openMenu(canvasElement),
});

/** Until OCR is set up, its item leads to Settings. */
export const MenuNotSetUp = meta.story({
  beforeEach: mockApi({ ocr: ocrSettingsEmpty }),
  play: ({ canvasElement }) => openMenu(canvasElement),
});

/** The dialog names the model OCR reviews with and offers no quick review. */
export const Dialog = meta.story({
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("menuitem", { name: /^Open Code Review/u })
    );
  },
});

/** A stored OCR review in the diff: severity, category and the suggested code. */
export const Findings = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const labels = await canvas.findAllByText("Open Code Review", {
      exact: false,
    });
    const row = labels.map((el) => el.closest("li")).find((li) => li !== null);
    const button =
      row && within(row).queryByRole("button", { name: "Show in diff" });
    if (button) {
      await userEvent.click(button);
    }
  },
});
