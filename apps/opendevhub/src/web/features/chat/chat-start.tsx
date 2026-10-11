import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import type {
  ComposerSendRequest,
  DashboardSnapshot,
} from "../../../shared/types";
import { startChat } from "../../api";
import { Empty, muted } from "../../components/page";
import { useDash } from "../../dashboard-context";
import { useNavigate } from "../../routing";
import { Logo } from "../../shell/logo";
import { Composer } from "../sessions/composer";
import {
  WORKTREES_UNAVAILABLE,
  canCreateWorktree,
  chatPath,
  chatProjects,
  chatTarget,
  checkoutChoices,
  defaultChatProject,
  defaultCheckoutChoice,
  readLastProject,
  rememberProject,
} from "./chat";

/** How long a started chat waits for the snapshot to list its task before opening its view anyway. */
const TASK_WAIT_MS = 10_000;

/** A started task the page waits to see in the snapshot. */
interface Waiting {
  projectId: string;
  task: string;
  done: () => void;
}

const lists = (snapshot: DashboardSnapshot | undefined, w: Waiting) =>
  snapshot?.projects
    .find((v) => v.project.id === w.projectId)
    ?.tasks.some((t) => t.id === w.task) === true;

/**
 * Chat's start page: the composer centred on an empty page, with the project and the checkout it starts in.
 * The first message starts a task there, and the page moves on to that chat's view.
 */
export const ChatStart = () => {
  const { snapshot, openAddProject } = useDash();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<string>();
  const [choice, setChoice] = useState<string>();
  const waiting = useRef<Waiting>(undefined);
  const latest = useRef(snapshot);

  // The view opens once the snapshot lists the new task, so it never says the chat doesn't exist.
  useEffect(() => {
    latest.current = snapshot;
    const w = waiting.current;
    if (w && lists(snapshot, w)) {
      w.done();
    }
  }, [snapshot]);

  if (!snapshot) {
    return (
      <ChatColumn>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </ChatColumn>
    );
  }
  const projects = chatProjects(snapshot);
  const view =
    projects.find((v) => v.project.id === projectId) ??
    defaultChatProject(projects, readLastProject());
  if (!view) {
    return (
      <ChatColumn>
        <Empty title="No projects yet">
          <p className={muted}>
            Add a project to chat with an agent in one of its checkouts.
          </p>
          <Button variant="outline" onClick={openAddProject}>
            Add project
          </Button>
        </Empty>
      </ChatColumn>
    );
  }
  const choices = checkoutChoices(view);
  const selected =
    choices.find((c) => c.value === choice && !c.disabled)?.value ??
    defaultCheckoutChoice(view);
  const { directory, label, target } = chatTarget(view, selected);
  const { id } = view.project;

  const send = async (message: ComposerSendRequest) => {
    const { task } = await startChat(id, { message, target });
    rememberProject(id);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, TASK_WAIT_MS);
      const w: Waiting = {
        done: () => {
          clearTimeout(timer);
          resolve();
        },
        projectId: id,
        task,
      };
      waiting.current = w;
      if (lists(latest.current, w)) {
        w.done();
      }
    });
    waiting.current = undefined;
    await navigate(chatPath(id, task), { replace: true });
    return undefined;
  };

  const ghost =
    "text-muted-foreground hover:text-foreground hover:bg-accent dark:bg-transparent dark:hover:bg-accent h-8 w-auto max-w-[50%] gap-1 border-0 bg-transparent px-2 shadow-none";

  return (
    <ChatColumn>
      <h1 className="flex items-center justify-center gap-3 text-center text-3xl font-medium tracking-tight sm:text-4xl">
        <Logo size={36} className="text-primary" />
        What shall we build?
      </h1>
      <Composer
        view={view}
        directory={directory}
        checkoutLabel={label}
        running={false}
        hubCommands={false}
        hero
        autoFocus
        onSend={send}
        footer={
          <div className="flex flex-col gap-1 px-1">
            <div className="flex items-center justify-between gap-2">
              <Select
                value={id}
                onValueChange={(next) => {
                  setProjectId(next);
                  setChoice(undefined);
                }}
              >
                <SelectTrigger aria-label="Project" className={ghost}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {projects.map((v) => (
                    <SelectItem key={v.project.id} value={v.project.id}>
                      {v.project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selected} onValueChange={setChoice}>
                <SelectTrigger aria-label="Checkout" className={ghost}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="end">
                  {choices.map((c) => (
                    <SelectItem
                      key={c.value}
                      value={c.value}
                      disabled={c.disabled}
                    >
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!canCreateWorktree(view) && (
              <p className="text-muted-foreground px-2 text-xs">
                New worktree: {WORKTREES_UNAVAILABLE}
              </p>
            )}
          </div>
        }
      />
    </ChatColumn>
  );
};

/** The column Chat's pages share, so the composer doesn't jump sideways after the first message. */
export const ChatColumn = (props: {
  children: ReactNode;
  centred?: boolean;
}) => (
  <div
    className={
      props.centred === false
        ? "mx-auto flex w-full max-w-3xl flex-col gap-5"
        : "mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col justify-center gap-8"
    }
  >
    {props.children}
  </div>
);
