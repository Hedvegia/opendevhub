import {
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  ListTreeIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

import { modelShortName } from "../../../shared/tasks";
import type {
  ProjectView,
  SessionDetail,
  SessionSummary,
  SessionTurn,
} from "../../../shared/types";
import { sessionUrl } from "../../../shared/urls";
import { Chip, muted } from "../../components/page";
import { Tip } from "../../components/tip";
import { When } from "../../components/when";
import { needsAttention, openUrlOf } from "../../derive";
import { useMediaQuery } from "../../hooks/use-media-query";
import type { Checkout } from "../checkouts/checkouts";
import { TurnChanges } from "../review/turn-changes";
import { formatCost, formatTokens } from "../tasks/tasks";
import { turnActivity, turnDuration } from "./session-detail";

export type PanelId = "turns" | "subagents";

const PANEL_KEY = "opendevhub.conversation.panel";
const WIDE_QUERY = "(min-width: 1024px)";

const readPanel = (): PanelId | undefined => {
  try {
    const stored = localStorage.getItem(PANEL_KEY);
    return stored === "turns" || stored === "subagents" ? stored : undefined;
  } catch {
    return undefined;
  }
};

const storePanel = (panel: PanelId | undefined): void => {
  try {
    if (panel) {
      localStorage.setItem(PANEL_KEY, panel);
    } else {
      localStorage.removeItem(PANEL_KEY);
    }
  } catch {
    // Not remembered; the next conversation opens with the panels closed.
  }
};

/** The open side panel, remembered on this browser; closed until the user opens one. */
export const useSidePanel = () => {
  const [panel, setPanel] = useState(readPanel);
  const show = (next: PanelId | undefined) => {
    setPanel(next);
    storePanel(next);
  };
  return {
    close: () => show(undefined),
    panel,
    toggle: (id: PanelId) => show(panel === id ? undefined : id),
  };
};

const PANELS = {
  subagents: { icon: BotIcon, label: "Subagents" },
  turns: { icon: ListTreeIcon, label: "Turns" },
} as const;

/** The icon buttons on the conversation's right edge, one per panel. */
export const PanelRail = (props: {
  panel?: PanelId;
  onToggle: (id: PanelId) => void;
  subagents: number;
}) => {
  const ids: PanelId[] =
    props.subagents > 0 ? ["turns", "subagents"] : ["turns"];
  return (
    <nav
      aria-label="Side panels"
      className="flex shrink-0 flex-col items-center gap-1 border-l px-1.5 py-2"
    >
      {ids.map((id) => {
        const { icon: Icon, label } = PANELS[id];
        return (
          <Tip key={id} label={label}>
            <Toggle
              size="sm"
              aria-label={label}
              pressed={props.panel === id}
              onPressedChange={() => props.onToggle(id)}
            >
              <Icon />
            </Toggle>
          </Tip>
        );
      })}
    </nav>
  );
};

/** The open panel: a column beside the transcript on wide screens, a sheet over it on narrow ones. */
export const SidePanel = (props: {
  panel: PanelId;
  onClose: () => void;
  hint?: ReactNode;
  children: ReactNode;
}) => {
  const wide = useMediaQuery(WIDE_QUERY);
  const { label } = PANELS[props.panel];
  if (!wide) {
    return (
      <Sheet open onOpenChange={(open) => !open && props.onClose()}>
        <SheetContent className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>{label}</SheetTitle>
            <SheetDescription className={props.hint ? undefined : "sr-only"}>
              {props.hint ?? label}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{props.children}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <aside
      aria-label={label}
      className="flex min-h-0 w-[26rem] shrink-0 flex-col border-l xl:w-[40%]"
    >
      <header className="flex items-center gap-2 border-b py-1.5 pr-1.5 pl-4">
        <h3 className="text-sm font-semibold">{label}</h3>
        {props.hint && (
          <span className={cn(muted, "text-xs")}>{props.hint}</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          aria-label={`Close ${label}`}
          onClick={props.onClose}
        >
          <XIcon />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{props.children}</div>
    </aside>
  );
};

/** The conversation's turns, newest first, each with its changes on demand. */
export const TurnsPanel = (props: {
  detail: SessionDetail;
  session: SessionSummary;
  projectId: string;
  checkout: Checkout;
  onSent: (notice: string) => void;
}) => {
  const { detail, session } = props;
  const running = session.status !== "idle";
  if (detail.turns.length === 0) {
    return (
      <p className={cn(muted, "px-4 py-3")}>
        No turns yet: the conversation hasn&apos;t been prompted.
      </p>
    );
  }
  return (
    <ol>
      {detail.turns.map((turn, i) => (
        <TurnItem
          key={turn.id}
          turn={turn}
          latest={i === 0}
          running={i === 0 && running}
          waiting={i === 0 && needsAttention(session.status)}
          projectId={props.projectId}
          checkout={props.checkout}
          sessionId={session.id}
          onSent={props.onSent}
        />
      ))}
    </ol>
  );
};

/** The conversation's subagents with their usage and a link to each in opencode. */
export const SubagentsPanel = (props: {
  detail: SessionDetail;
  view: ProjectView;
  session: SessionSummary;
}) => (
  <ul>
    {props.detail.subagents.map((sub) => (
      <li
        key={sub.id}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-t px-4 py-2 text-sm first:border-t-0"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{sub.title}</span>
          {sub.agent && <Chip>{sub.agent}</Chip>}
        </span>
        <a
          className="row-span-2 inline-flex items-center gap-1 text-sm font-medium hover:underline"
          href={sessionUrl(openUrlOf(props.view, props.session.envId), sub.id)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open <ExternalLinkIcon className="size-3.5" />
        </a>
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatCost(sub.cost)} · {formatTokens(sub.tokens)} tokens ·{" "}
          <When at={sub.updatedAt} />
        </span>
      </li>
    ))}
  </ul>
);

const LONG_PROMPT_CHARS = 280;
const LONG_PROMPT_LINES = 3;

const TurnItem = (props: {
  turn: SessionTurn;
  latest: boolean;
  running: boolean;
  /** The session waits on a permission or an answer. */
  waiting: boolean;
  projectId: string;
  checkout: Checkout;
  sessionId: string;
  onSent: (notice: string) => void;
}) => {
  const { turn, running } = props;
  // The newest turn shows its changes from the start; older ones on demand.
  const [open, setOpen] = useState(props.latest);
  const [whole, setWhole] = useState(false);
  const long =
    turn.prompt.length > LONG_PROMPT_CHARS ||
    turn.prompt.split("\n").length > LONG_PROMPT_LINES;
  const duration = turnDuration(turn, running);
  const activity = turnActivity(turn);
  const usage = [
    turn.cost !== undefined && formatCost(turn.cost),
    turn.tokens !== undefined && `${formatTokens(turn.tokens)} tokens`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex flex-col gap-2 border-t px-4 py-3 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p
            className={cn(
              "text-sm font-medium break-words whitespace-pre-wrap",
              long && !whole && "line-clamp-3"
            )}
          >
            {turn.prompt || "(empty prompt)"}
          </p>
          {long && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground self-start text-xs"
              onClick={() => setWhole((w) => !w)}
            >
              {whole ? "Show less" : "Show the whole prompt"}
            </button>
          )}
        </div>
        <When
          at={turn.created}
          className="text-muted-foreground shrink-0 text-xs whitespace-nowrap"
        />
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums">
        {running ? (
          <span className="text-foreground inline-flex items-center gap-1">
            {props.waiting ? (
              <span className="text-attention">Waiting on you</span>
            ) : (
              <>
                <LoaderCircleIcon className="size-3 animate-spin" /> Working
              </>
            )}
          </span>
        ) : (
          duration && <span>{duration}</span>
        )}
        {usage && <span>{usage}</span>}
        {activity && <span>{activity}</span>}
        {turn.model && (
          <Tip label={turn.agent ? `Agent ${turn.agent}` : "Model"}>
            <span>{modelShortName(turn.model)}</span>
          </Tip>
        )}
      </div>
      {turn.error && (
        <p className="text-destructive text-sm break-words">{turn.error}</p>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 self-start"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDownIcon /> : <ChevronRightIcon />} Changes
        {turn.files > 0 && (
          <span className="text-muted-foreground">({turn.files})</span>
        )}
      </Button>
      {open && (
        <TurnChanges
          projectId={props.projectId}
          target={props.checkout.target}
          directory={props.checkout.directory}
          sessionId={props.sessionId}
          turn={turn}
          latest={props.latest}
          running={running}
          onSent={props.onSent}
        />
      )}
    </li>
  );
};
