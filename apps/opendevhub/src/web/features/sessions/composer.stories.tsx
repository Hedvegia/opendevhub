import { expect, fn, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import type {
  ComposerSendResult,
  ProjectView,
  SessionSummary,
} from "../../../shared/types";
import { webProject } from "../../mocks/fixtures";
import { checkoutOf } from "../checkouts/checkouts";
import { Composer } from "./composer";

const session: SessionSummary = (() => {
  const found = webProject.sessions.find((s) => s.id === "ses_idle01");
  if (!found) {
    throw new Error("No fixture session ses_idle01");
  }
  return found;
})();

const checkout = checkoutOf(webProject, session.directory) ?? {
  directory: session.directory,
  label: "main",
  target: "",
};

const stopped: ProjectView = {
  ...webProject,
  runtime: { ...webProject.runtime, containerState: "stopped" },
};

const meta = preview.meta({
  args: {
    checkoutLabel: checkout.worktree?.branch ?? checkout.label,
    directory: checkout.directory,
    hubCommands: true,
    onSend: fn((): Promise<ComposerSendResult | undefined> =>
      Promise.resolve({ kind: "prompt", queued: false })
    ),
    onSent: fn(),
    running: session.status !== "idle",
    view: webProject,
  },
  component: Composer,
  parameters: { layout: "padded" },
  title: "Components/Composer",
});

/** Ready to send: the box, with attach, agent, model and send under it. */
export const Idle = meta.story();

/** `/` at the start of the message lists the hub's commands, then the checkout's opencode commands. */
export const CommandListOpen = meta.story({
  args: { initialText: "/op" },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByRole("option", { name: /opsx-propose/iu })
    ).toBeVisible();
  },
});

/** `@` lists matching files and the subagents, in separate groups. */
export const MentionListOpen = meta.story({
  args: { initialText: "explain @lo" },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByRole("option", {
        name: /src\/server\/auth\/login\.ts/iu,
      })
    ).toBeVisible();
  },
});

/** Chat's start composer: no conversation yet, so the hub's `/new` and `/interrupt` aren't offered. */
export const StartComposer = meta.story({
  args: {
    autoFocus: true,
    checkoutLabel: "New worktree",
    hubCommands: false,
    initialText: "/",
    onSend: fn(() => Promise.resolve(undefined)),
    running: false,
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByRole("option", { name: /opsx-propose/iu })
    ).toBeVisible();
    await expect(
      page.queryByRole("option", { name: /^\/new\b/iu })
    ).not.toBeInTheDocument();
  },
});

/** The environment that serves the checkout is stopped: nothing can be sent, and the composer says why. */
export const EnvironmentStopped = meta.story({
  args: { view: stopped },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("combobox")).toBeDisabled();
    await expect(
      canvas.getByText(/isn't running/iu, { selector: "p" })
    ).toBeVisible();
  },
});
