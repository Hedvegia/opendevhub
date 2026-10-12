import { ArrowDownIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { modelShortName } from "../../../shared/tasks";
import type {
  ComposerSendRequest,
  ComposerSendResult,
  ProjectView,
  SessionDetail,
  SessionSummary,
} from "../../../shared/types";
import { Chip } from "../../components/page";
import { SessionBadge } from "../../components/status";
import { Tip } from "../../components/tip";
import { needsAttention, sessionHref } from "../../derive";
import { Link } from "../../routing";
import { CheckoutProvider } from "../checkouts/checkout-context";
import type { Checkout } from "../checkouts/checkouts";
import { ProjectReview } from "../review/project-review";
import { taskChip } from "../tasks/tasks";
import { Composer } from "./composer";
import { PendingStack } from "./pending-cards";
import {
  ConversationSidebar,
  SubagentsPanel,
  TurnsPanel,
  useSidePanel,
} from "./side-panel";
import type { OpenPanel, PanelId } from "./side-panel";
import { Transcript } from "./transcript";
import { UsagePopover } from "./usage-popover";
import { useStickToBottom } from "./use-stick-to-bottom";

/** How long a send's notice stays under the transcript. */
const NOTICE_MS = 5000;

/**
 * One conversation, filling the height it is given: a one-line header, the transcript scrolling under it, the
 * pending cards and the composer pinned to the bottom, and a right sidebar of panels. `chips` and `actions` add to
 * the header, e.g. the Chat view's project and its link to the task; `changes` adds the checkout's Changes panel.
 */
export const Conversation = (props: {
  view: ProjectView;
  checkout: Checkout;
  session: SessionSummary;
  detail?: SessionDetail;
  error?: string;
  /** Adds a chip linking to the task the conversation belongs to. */
  showTask?: boolean;
  /** Offers the checkout's changes in a side panel, for a conversation whose page has no Changes of its own. */
  changes?: boolean;
  chips?: ReactNode;
  actions?: ReactNode;
  onSend: (
    message: ComposerSendRequest
  ) => Promise<ComposerSendResult | undefined>;
}) => {
  const { view, checkout, session, detail } = props;
  const projectId = view.project.id;
  const { behind, contentRef, scrollRef, scrollToBottom } = useStickToBottom();
  const { panel, toggle, close } = useSidePanel();
  const [notice, setNotice] = useState<string>();
  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(() => setNotice(undefined), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const title = session.title || "Untitled conversation";
  const task = props.showTask ? taskChip(view, session) : undefined;
  const running = session.status !== "idle";
  const openHref = sessionHref(view, session);
  const subagents = detail?.subagents.length ?? 0;
  const panels: PanelId[] = [
    "turns",
    ...(props.changes ? (["changes"] as const) : []),
    ...(subagents > 0 ? (["subagents"] as const) : []),
  ];
  // A remembered panel this conversation doesn't offer stays shut.
  const shown = panel && panels.includes(panel) ? panel : undefined;
  let open: OpenPanel | undefined;
  if (shown === "changes") {
    open = {
      children: (
        <CheckoutProvider value={{ checkout, sessionId: session.id, view }}>
          <ProjectReview />
        </CheckoutProvider>
      ),
      hint: checkout.worktree
        ? "Commits against the base, and what isn't committed"
        : "What isn't committed",
      id: shown,
    };
  } else if (shown === "turns" && detail) {
    open = {
      children: (
        <TurnsPanel
          detail={detail}
          session={session}
          projectId={projectId}
          checkout={checkout}
          onSent={setNotice}
        />
      ),
      hint: `${detail.turns.length}${detail.more ? "+" : ""}, newest first`,
      id: shown,
    };
  } else if (shown === "subagents" && detail) {
    open = {
      children: (
        <SubagentsPanel detail={detail} view={view} session={session} />
      ),
      hint: subagents,
      id: shown,
    };
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex min-w-0 items-center gap-2 border-b pb-2">
          <h2
            className="min-w-16 truncate text-base font-semibold"
            title={title}
          >
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5 text-xs">
            <SessionBadge status={session.status} />
          </div>
          <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 overflow-hidden text-xs max-md:hidden">
            {session.model && <Chip>{modelShortName(session.model)}</Chip>}
            {detail?.agent && <Chip>{detail.agent}</Chip>}
            {task &&
              (task.to ? (
                <Chip
                  asChild
                  className="text-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <Link to={task.to} title={task.title}>
                    {task.label}
                  </Link>
                </Chip>
              ) : (
                <Chip className="text-foreground" title={task.title}>
                  {task.label}
                </Chip>
              ))}
            {props.chips}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <UsagePopover session={session} detail={detail} />
            <Tip label="Open in opencode">
              <Button asChild variant="ghost" size="icon" className="size-8">
                <a
                  href={openHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open in opencode"
                >
                  <ExternalLinkIcon />
                </a>
              </Button>
            </Tip>
            {props.actions}
          </div>
        </header>

        <div className="relative min-h-48 flex-1">
          <div ref={scrollRef} className="absolute inset-0 overflow-y-auto">
            <div
              ref={contentRef}
              className="mx-auto w-full max-w-3xl px-1 py-5"
            >
              {props.error && (
                <Alert variant="destructive">
                  <AlertDescription>{props.error}</AlertDescription>
                </Alert>
              )}
              {!detail && !props.error && (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-10 w-1/2 self-end" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              )}
              {detail && (
                <Transcript
                  transcript={detail.transcript}
                  more={detail.more}
                  openHref={openHref}
                  working={running && !needsAttention(session.status)}
                />
              )}
            </div>
          </div>
          {behind && (
            <Button
              variant="secondary"
              size="sm"
              className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md"
              onClick={scrollToBottom}
            >
              <ArrowDownIcon /> Jump to latest
            </Button>
          )}
        </div>

        <footer className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-3 pt-2">
          {session.pending && (
            <div className="max-h-[45svh] overflow-y-auto">
              <PendingStack session={session} view={view} />
            </div>
          )}
          {notice && (
            <p className="text-ok text-xs" role="status">
              {notice}
            </p>
          )}
          <Composer
            view={view}
            directory={checkout.directory}
            checkoutLabel={checkout.worktree?.branch ?? checkout.label}
            running={running}
            model={session.model}
            hubCommands
            onSend={props.onSend}
            onSent={(sent) => {
              setNotice(sent);
              scrollToBottom();
            }}
          />
        </footer>
      </div>

      <ConversationSidebar
        panels={panels}
        open={open}
        onToggle={toggle}
        onClose={close}
      />
    </div>
  );
};
