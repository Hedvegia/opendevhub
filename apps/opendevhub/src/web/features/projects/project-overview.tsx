import { GitBranchIcon, InfoIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ProjectView } from "../../../shared/types";
import { archiveTask, refreshWorktrees } from "../../api";
import { CopyButton } from "../../components/copy-button";
import { EnvBadge } from "../../components/env-badge";
import { Chip, Note, PageHeader, Section } from "../../components/page";
import { ResourceStat } from "../../components/resource-stat";
import { STATE_LABEL, StatusDot, TONE_LABEL } from "../../components/status";
import { Tip } from "../../components/tip";
import { useDash } from "../../dashboard-context";
import { envOfDirectory, projectTone, workspaceFolderOf } from "../../derive";
import { checkoutResources } from "../../lib/resources";
import { Link, Navigate, useSearchParams } from "../../routing";
import { ActivityButton } from "../activity/activity-button";
import { chatActivity, chatNeedsYou } from "../chat/chat";
import { ChatRow } from "../chat/chat-rows";
import {
  checkoutCounts,
  checkoutPath,
  checkoutTone,
  projectTasks,
  sessionPath,
  standaloneCheckouts,
} from "../checkouts/checkouts";
import type { Checkout, ProjectTask } from "../checkouts/checkouts";
import { OpenInMenu } from "../checkouts/open-in-menu";
import { WorktreeCreator } from "../checkouts/worktree-creator";
import {
  checkoutReady,
  ContainerMenu,
  NewWorktreeButton,
  useCheckoutActions,
} from "../checkouts/worktrees";
import { PendingStack } from "../sessions/pending-cards";
import { TaskRow } from "../tasks/task-rows";
import { formatCost, formatTokens } from "../tasks/tasks";
import { projectUsage } from "../usage/usage";
import { AllContainersMenu, projectFlags } from "./project-actions";
import { useProjectView } from "./project-layout";
import { ProjectSettingsButton } from "./project-settings-dialog";

/** How many chats the project page lists; the rest are on the chats page. */
const PROJECT_CHATS = 8;

export const ProjectOverview = () => {
  const view = useProjectView();
  const { newTask, snapshot } = useDash();
  const [params] = useSearchParams();
  const { runtime, project } = view;
  const usage = projectUsage(snapshot, project.id);
  const { running } = projectFlags(view, false);
  const root = runtime.worktreeRoot;

  // Pick up worktrees made outside opendevhub (by opencode or a shell).
  useEffect(() => {
    if (running) {
      void refreshWorktrees(project.id).catch(() => undefined);
    }
  }, [project.id, running]);

  // `?session=` (from notifications and new conversations) goes to the session's task once it is known.
  const highlight = params.get("session");
  const highlighted = highlight
    ? view.sessions.find((s) => s.id === highlight)
    : undefined;
  // Its checkout unknown, sessionPath points back here; stay rather than loop.
  const destination = highlighted && sessionPath(view, highlighted);
  if (destination && !destination.includes("?session=")) {
    return <Navigate replace to={destination} />;
  }

  const tasks = projectTasks(view);
  const live = (t: ProjectTask) => t.state !== "ended" && t.state !== "draft";
  const attention = tasks.filter((t) => t.attention && live(t));
  const active = tasks.filter((t) => !t.attention && live(t));
  const drafts = tasks.filter((t) => t.state === "draft");
  const ended = tasks.filter((t) => t.state === "ended");
  const chats = view.chats.toSorted(
    (a, b) => chatActivity(b) - chatActivity(a)
  );
  const waitingChats = chats.filter(chatNeedsYou);
  const otherChats = chats.filter((c) => !chatNeedsYou(c));

  return (
    <>
      <PageHeader
        title={
          <>
            <StatusDot tone={projectTone(view)} /> {project.name}
          </>
        }
        description={
          <div className="flex flex-col gap-2">
            <p className="flex min-w-0 items-center gap-1 font-mono text-xs">
              <span className="truncate">{project.path}</span>{" "}
              <CopyButton text={project.path} label="Copy path" />
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant="outline"
                className={STATE_PILL[runtime.containerState]}
              >
                {STATE_LABEL[runtime.containerState]}
              </Badge>
              {running && (
                <Badge
                  variant="outline"
                  className={OPENCODE_PILL[runtime.opencode]}
                >
                  opencode {runtime.opencode}
                  {runtime.opencodeVersion
                    ? ` · v${runtime.opencodeVersion}`
                    : ""}
                </Badge>
              )}
            </div>
            {usage && (
              <p
                className="text-xs tabular-nums"
                title={`Tokens today ${formatTokens(usage.today.tokens)} · all time ${formatTokens(usage.total.tokens)}`}
              >
                Today {formatCost(usage.today.cost)} · All time{" "}
                {formatCost(usage.total.cost)}
              </p>
            )}
          </div>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => newTask(project.id)}
              title="New task (n)"
            >
              <PlusIcon /> New task
            </Button>
            <OpenInMenu
              view={view}
              directory={workspaceFolderOf(view)}
              hostPath={project.path}
            />
            <ActivityButton
              filter={{ projectId: project.id }}
              subject={project.name}
              empty="Nothing has happened in this project yet."
            />
            <ProjectSettingsButton view={view} />
            <AllContainersMenu view={view} />
          </>
        }
      />

      {runtime.error && (
        <Alert variant="destructive">
          <AlertDescription>{runtime.error}</AlertDescription>
        </Alert>
      )}

      {attention.length + waitingChats.length > 0 && (
        <Section
          title="Needs you"
          hint={attention.length + waitingChats.length}
          attention
        >
          <ul>
            {attention.map((t) => (
              <TaskRow key={t.task} projectId={project.id} task={t}>
                <WaitingCards view={view} task={t.task} />
              </TaskRow>
            ))}
            {waitingChats.map((c) => (
              <ChatRow key={c.id} projectId={project.id} chat={c} />
            ))}
          </ul>
        </Section>
      )}

      {drafts.length > 0 && (
        <Section title="Drafts" hint={drafts.length}>
          <ul>
            {drafts.map((t) => (
              <TaskRow key={t.task} projectId={project.id} task={t} />
            ))}
          </ul>
        </Section>
      )}

      {active.length > 0 && (
        <Section title="Tasks" hint={active.length}>
          <ul>
            {active.map((t) => (
              <TaskRow key={t.task} projectId={project.id} task={t} />
            ))}
          </ul>
        </Section>
      )}

      {ended.length > 0 && <EndedTasks projectId={project.id} tasks={ended} />}

      {otherChats.length > 0 && (
        <Section
          title="Chats"
          hint={otherChats.length}
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to={`/chats?project=${encodeURIComponent(project.id)}`}>
                Show all
              </Link>
            </Button>
          }
        >
          <ul>
            {otherChats.slice(0, PROJECT_CHATS).map((c) => (
              <ChatRow key={c.id} projectId={project.id} chat={c} />
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Worktrees"
        hint={
          root?.mounted && (
            <Tip
              label={
                <>
                  Worktrees live in{" "}
                  <code className="font-mono">{root.host}</code>, mounted at{" "}
                  <code className="font-mono">{root.container}</code>.
                </>
              }
            >
              <InfoIcon
                className="size-4 align-[-3px]"
                tabIndex={0}
                aria-label="Where worktrees live"
              />
            </Tip>
          )
        }
        action={
          <div className="flex items-center gap-1">
            {running && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void refreshWorktrees(project.id).catch(() => undefined)
                }
              >
                <RefreshCwIcon /> Refresh
              </Button>
            )}
            <NewWorktreeButton view={view} />
          </div>
        }
      >
        {!running && (
          <Note className="m-3">
            Start the project to create worktrees. Worktrees on this machine can
            still be opened.
          </Note>
        )}
        <ul>
          {standaloneCheckouts(view).map((c) => (
            <CheckoutRow key={c.directory} view={view} checkout={c} />
          ))}
        </ul>
      </Section>
    </>
  );
};

/** The permission and question cards of a task's conversations that wait on the user, to answer in place. */
const WaitingCards = (props: { view: ProjectView; task: string }) => {
  const waiting = props.view.sessions.filter(
    (s) => s.task?.id === props.task && s.pending
  );
  if (waiting.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 px-4 pb-3">
      {waiting.map((s) => (
        <PendingStack key={s.id} session={s} view={props.view} />
      ))}
    </div>
  );
};

/** One checkout: the whole row opens it; its own buttons sit above the stretched link. */
const CheckoutRow = ({
  view,
  checkout: c,
}: {
  view: ProjectView;
  checkout: Checkout;
}) => {
  const { pending, newSession, remove } = useCheckoutActions(view);
  const env = envOfDirectory(view, c.directory);
  const tone = checkoutTone(view, c.directory);
  const n = checkoutCounts(view, c.directory);
  const to = checkoutPath(view.project.id, c.target);
  const { snapshot } = useDash();
  const resources = checkoutResources(snapshot, view, c);

  return (
    <li
      className={cn(
        "hover:bg-muted/50 relative grid items-center gap-x-5 gap-y-2 border-t px-4 py-3 first:border-t-0",
        "md:grid-cols-[minmax(0,1fr)_9rem_auto_auto]",
        tone === "attention" && "shadow-[inset_3px_0_var(--attention)]"
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot tone={tone} label={TONE_LABEL[tone]} />
          <Link
            to={to}
            className="flex min-w-0 items-center gap-1.5 font-semibold after:absolute after:inset-0 hover:underline"
          >
            {c.worktree && (
              <GitBranchIcon className="text-muted-foreground size-3.5 shrink-0" />
            )}
            <span className="truncate">{c.label}</span>
          </Link>
          {!c.worktree && <Chip>main</Chip>}
          {env && (
            <span className="relative">
              <EnvBadge env={env} />
            </span>
          )}
          {c.worktree && (
            <span className="relative flex min-w-0 items-center gap-2">
              <WorktreeCreator
                projectId={view.project.id}
                worktree={c.worktree}
              />
            </span>
          )}
        </div>
        <p
          className="text-muted-foreground flex min-w-0 items-center gap-1 pl-4 font-mono text-xs"
          title={c.hostPath ?? c.directory}
        >
          {c.hostPath ? (
            <>
              <span className="truncate">{c.hostPath}</span>
              <span className="relative">
                <CopyButton text={c.hostPath} label="Copy path" />
              </span>
            </>
          ) : (
            <span className="truncate">only in container ({c.directory})</span>
          )}
        </p>
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs max-md:pl-4">
        {n.attention > 0 && (
          <span className="text-attention font-semibold">
            {n.attention} {n.attention === 1 ? "needs" : "need"} you
          </span>
        )}
        {n.running > 0 && <span>{n.running} working</span>}
        {n.idle > 0 && <span>{n.idle} idle</span>}
        {n.attention + n.running + n.idle === 0 && (
          <span>No conversations</span>
        )}
      </div>
      <span className="max-md:hidden">
        {resources && <ResourceStat {...resources} />}
      </span>
      <div className="relative flex items-center gap-2 max-md:pl-4 md:justify-self-end">
        <Button
          variant="outline"
          size="sm"
          disabled={!checkoutReady(view, c) || !!pending}
          onClick={() => newSession(c)}
        >
          <PlusIcon /> Conversation
        </Button>
        <OpenInMenu
          view={view}
          directory={c.directory}
          hostPath={c.hostPath}
          compact
        />
        <ContainerMenu
          view={view}
          checkout={c}
          compact
          onRemoveWorktree={
            c.worktree && !pending ? () => remove(c) : undefined
          }
        />
      </div>
    </li>
  );
};

const STATE_PILL: Record<ProjectView["runtime"]["containerState"], string> = {
  error: "border-destructive/45 text-destructive",
  running: "border-ok/45 text-ok",
  starting: "border-warn/45 text-warn",
  stopped: "text-muted-foreground",
  stopping: "border-warn/45 text-warn",
};

const OPENCODE_PILL: Record<ProjectView["runtime"]["opencode"], string> = {
  absent: "text-muted-foreground",
  healthy: "border-ok/45 text-ok",
  starting: "border-warn/45 text-warn",
  unhealthy: "border-destructive/45 text-destructive",
};

/** Tasks whose conversations are all gone, collapsed until opened; each can be archived. */
const EndedTasks = (props: { projectId: string; tasks: ProjectTask[] }) => {
  const { report } = useDash();
  const [open, setOpen] = useState(false);
  return (
    <Section
      title={`Ended tasks (${props.tasks.length})`}
      hint="their conversations are gone; archive them to hide them"
      action={
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Show"}
        </Button>
      }
    >
      {open && (
        <ul>
          {props.tasks.map((t) => (
            <TaskRow
              key={t.task}
              projectId={props.projectId}
              task={t}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void archiveTask(props.projectId, t.task).catch(report)
                  }
                >
                  Archive
                </Button>
              }
            />
          ))}
        </ul>
      )}
    </Section>
  );
};
