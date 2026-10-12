import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { models, webProject } from "../../mocks/fixtures";
import { MakeTaskForm } from "./make-task-dialog";

const [chat] = webProject.chats;

const meta = preview.meta({
  args: { chat, onClose: fn(), state: { models }, view: webProject },
  component: MakeTaskForm,
  title: "Pages/Chat/Make task",
});

/** The brief is still being drafted from the conversation. */
export const Drafting = meta.story({});

/** The drafted brief filled the field. */
export const Drafted = meta.story({
  args: {
    state: {
      brief:
        "## Goal\nA dark mode toggle in Settings that follows the system by default.\n\n## Open questions\n- Should charts switch palettes too?",
      models,
    },
  },
});

/** The brief couldn't be drafted: the field stays empty and editable, and says why. */
export const DraftFailed = meta.story({
  args: { state: { briefError: "opencode did not answer", models } },
});

/** The ticket in the branch and a pull request whose head is the branch are offered. */
export const WithSuggestions = meta.story({
  args: {
    state: {
      brief: "Add a dark mode toggle.",
      models,
      suggestions: {
        pullRequests: [
          {
            number: 48,
            title: "Dark mode toggle",
            url: "https://git.acme.dev/acme/web/pulls/48",
          },
        ],
        tickets: ["ACME-142", "ACME-7"],
      },
    },
  },
});
