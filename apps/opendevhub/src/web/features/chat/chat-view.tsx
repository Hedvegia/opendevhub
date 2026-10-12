import { useParams } from "@tanstack/react-router";
import { ArrowUpRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { Chip, Empty, muted } from "../../components/page";
import { useDash } from "../../dashboard-context";
import { Link, Navigate, useSearchParams } from "../../routing";
import { SessionView } from "../sessions/session-page";
import { taskOf, taskPath } from "../tasks/tasks";
import { conversationCheckout, VariantWaiting } from "../tasks/variant-waiting";
import { chatPath, chatVariant } from "./chat";
import { ChatColumn } from "./chat-start";

/**
 * One chat: its task's conversation full-width and full-height, with a header naming the task, project and checkout
 * and a link to the task page for its changes, terminal and runtime. `?session=` is a conversation `/new` started here; the page
 * moves on to its chat once the snapshot knows its task.
 */
export const ChatView = () => {
  const { projectId = "", task: taskId = "" } = useParams({ strict: false });
  const { snapshot } = useDash();
  const [params, setParams] = useSearchParams();

  if (!snapshot) {
    return (
      <ChatColumn centred={false}>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </ChatColumn>
    );
  }
  const view = snapshot.projects.find((v) => v.project.id === projectId);
  const task = view && taskOf(view, taskId);
  const variant = task && chatVariant(task);
  if (!view || !task || !variant) {
    return (
      <ChatColumn centred={false}>
        <Empty title="Chat not found">
          <p className={muted}>
            It was archived, or its project is no longer registered.
          </p>
          <Button asChild variant="outline">
            <Link to="/chat">New chat</Link>
          </Button>
        </Empty>
      </ChatColumn>
    );
  }

  const started = params.get("session");
  const next = started
    ? view.sessions.find((s) => s.id === started)?.task?.id
    : undefined;
  if (next && next !== task.id) {
    return <Navigate replace to={chatPath(view.project.id, next)} />;
  }

  const session = variant.sessionId
    ? view.sessions.find((s) => s.id === variant.sessionId)
    : undefined;
  const directory = session?.directory ?? variant.directory;
  const checkout = directory
    ? conversationCheckout(view, directory)
    : undefined;
  const checkoutLabel =
    checkout?.worktree?.branch ??
    checkout?.label ??
    variant.branch ??
    "New worktree";

  const chips = (
    <>
      <Chip>{view.project.name}</Chip>
      <Chip>{checkoutLabel}</Chip>
    </>
  );
  const openTask = (
    <Button asChild variant="outline" size="sm">
      <Link to={taskPath(view.project.id, task.id)}>
        <span className="max-sm:sr-only">Open task</span> <ArrowUpRightIcon />
      </Link>
    </Button>
  );

  return (
    <ChatColumn centred={false}>
      {session && checkout ? (
        <SessionView
          key={session.id}
          view={view}
          checkout={checkout}
          session={session}
          chips={chips}
          actions={openTask}
          onStarted={(id) => setParams({ session: id }, { replace: true })}
        />
      ) : (
        <>
          <header className="flex min-w-0 items-center gap-2 border-b pb-2">
            <h1 className="min-w-0 truncate text-base font-semibold">
              {task.title || "Untitled chat"}
            </h1>
            <div className="flex min-w-0 items-center gap-1.5 text-xs max-md:hidden">
              {chips}
            </div>
            <div className="ml-auto shrink-0">{openTask}</div>
          </header>
          <div className="mx-auto w-full max-w-3xl">
            <VariantWaiting view={view} variant={variant} details />
          </div>
        </>
      )}
    </ChatColumn>
  );
};
