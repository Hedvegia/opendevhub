import type {
  ChatTarget,
  DashboardSnapshot,
  ProjectView,
  TaskView,
  VariantView,
} from "../../../shared/types";
import { workspaceFolderOf } from "../../derive";
import { checkouts } from "../checkouts/checkouts";
import { defaultVariant } from "../tasks/tasks";

/** The project the start composer picks on this browser, as long as it is still registered. */
export const LAST_PROJECT_KEY = "opendevhub.chat.project";

/** The checkout picker's value for a new worktree; the others are checkout directories. */
export const NEW_WORKTREE = "worktree";

export const WORKTREES_UNAVAILABLE =
  "The project's container has no worktrees folder; rebuild it to enable worktrees.";

/** A chat's own page: the task's conversation full-width. */
export const chatPath = (projectId: string, task: string): string =>
  `/chat/${encodeURIComponent(projectId)}/${encodeURIComponent(task)}`;

export const readLastProject = (): string | undefined => {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

export const rememberProject = (projectId: string): void => {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, projectId);
  } catch {
    // Not remembered; the picker falls back to the first project.
  }
};

/** The registered projects by name. */
export const chatProjects = (snapshot: DashboardSnapshot): ProjectView[] =>
  snapshot.projects.toSorted((a, b) =>
    a.project.name.localeCompare(b.project.name)
  );

/** The project the start composer opens with: the last one chatted in, else the first by name. */
export const defaultChatProject = (
  projects: ProjectView[],
  last: string | undefined
): ProjectView | undefined =>
  projects.find((v) => v.project.id === last) ?? projects[0];

export const canCreateWorktree = (view: ProjectView): boolean =>
  view.runtime.worktreeRoot?.mounted === true;

export interface CheckoutChoice {
  value: string;
  label: string;
  disabled?: boolean;
}

/** New worktree, the main checkout, then each worktree by branch or folder name. */
export const checkoutChoices = (view: ProjectView): CheckoutChoice[] => [
  {
    label: "New worktree",
    value: NEW_WORKTREE,
    ...(canCreateWorktree(view) ? {} : { disabled: true }),
  },
  ...checkouts(view).map((c) => ({ label: c.label, value: c.directory })),
];

/** New worktree when the project can make one, else the main checkout. */
export const defaultCheckoutChoice = (view: ProjectView): string =>
  canCreateWorktree(view) ? NEW_WORKTREE : workspaceFolderOf(view);

/** What the composer is scoped to and where the start request sends the chat. */
export const chatTarget = (
  view: ProjectView,
  choice: string
): { directory: string; label: string; target: ChatTarget } => {
  if (choice === NEW_WORKTREE) {
    return {
      directory: workspaceFolderOf(view),
      label: "New worktree",
      target: { kind: "worktree" },
    };
  }
  const label =
    checkoutChoices(view).find((c) => c.value === choice)?.label ?? choice;
  return {
    directory: choice,
    label,
    target: { directory: choice, kind: "checkout" },
  };
};

/** The variant a chat shows: the task page's default one. */
export const chatVariant = (task: TaskView): VariantView | undefined =>
  defaultVariant(task);
