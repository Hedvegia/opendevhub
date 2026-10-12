import {
  ContainerIcon,
  FolderGit2Icon,
  FolderIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  LayersIcon,
  ListTodoIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  SparklesIcon,
  TicketIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ObjectType } from "../../../shared/activity";

/** The icon each kind of entity is shown with in trails, chips and the feed. */
export const ENTITY_ICON: Record<ObjectType, LucideIcon> = {
  branch: GitBranchIcon,
  chat: MessagesSquareIcon,
  environment: ContainerIcon,
  project: FolderIcon,
  pull_request: GitPullRequestIcon,
  review: SparklesIcon,
  session: MessageSquareIcon,
  task: ListTodoIcon,
  ticket: TicketIcon,
  variant: LayersIcon,
  worktree: FolderGit2Icon,
};

export const ENTITY_NAME: Record<ObjectType, string> = {
  branch: "Branch",
  chat: "Chat",
  environment: "Container",
  project: "Project",
  pull_request: "Pull request",
  review: "AI review",
  session: "Conversation",
  task: "Task",
  ticket: "Ticket",
  variant: "Variant",
  worktree: "Worktree",
};
