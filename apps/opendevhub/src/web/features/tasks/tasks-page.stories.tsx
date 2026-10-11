import preview from "../../../../.storybook/preview";
import { App } from "../../app";

const meta = preview.meta({
  component: App,
  parameters: { route: "/tasks" },
  title: "Pages/Tasks",
});

/** Every project's tasks, grouped by project. */
export const Default = meta.story();

/** Only the tasks whose conversations wait on the user. */
export const NeedsYou = meta.story({
  parameters: { route: "/tasks?status=attention" },
});

/** An old Sessions link, redirected with its filter. */
export const OldSessionsLink = meta.story({
  parameters: { route: "/sessions?status=running" },
});
