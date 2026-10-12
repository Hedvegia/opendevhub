import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { SessionSummary } from "../../../shared/types";
import { Note } from "../../components/page";
import { SessionBadge } from "../../components/status";
import { When } from "../../components/when";
import { Link, useSearchParams } from "../../routing";
import { sessionPath } from "../checkouts/checkouts";
import { SessionView } from "../sessions/session-page";
import { useTaskPage } from "./task-context";
import { conversationThreads, taskOf } from "./tasks";
import { conversationCheckout, VariantWaiting } from "./variant-waiting";

/** The selected variant's conversation, and the other conversations in its checkout as threads (`?thread=`). */
export const TaskConversation = () => {
  const { view, task, variant } = useTaskPage();
  const [params, setParams] = useSearchParams();
  const threads = conversationThreads(view, variant);
  const own = threads.find((s) => s.id === variant.sessionId);
  const selected = threads.find((s) => s.id === params.get("thread")) ?? own;
  const others = threads.filter((s) => s.id !== own?.id);
  const checkout = selected && conversationCheckout(view, selected.directory);

  const select = (id: string | undefined) =>
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (id && id !== own?.id) {
          out.set("thread", id);
        } else {
          out.delete("thread");
        }
        return out;
      },
      { replace: true }
    );

  let body;
  if (selected && checkout) {
    body = (
      <SessionView
        key={selected.id}
        view={view}
        checkout={checkout}
        session={selected}
        showTask={selected.id !== own?.id}
        onStarted={select}
      />
    );
  } else {
    body = <VariantWaiting view={view} variant={variant} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {others.length > 0 && (
        <Threads
          threads={others}
          selected={selected?.id === own?.id ? undefined : selected?.id}
          taskId={task.id}
          onSelect={select}
        />
      )}
      {selected && own && selected.id !== own.id && (
        <Note>
          Another conversation in this checkout
          {selected.task && selected.task.id !== task.id && (
            <>
              , from{" "}
              <Link
                to={sessionPath(view, selected)}
                className="underline-offset-4 hover:underline"
              >
                {taskOf(view, selected.task.id)?.title || "its own task"}
              </Link>
            </>
          )}
          .{" "}
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => select(undefined)}
          >
            Back to this task&apos;s conversation
          </Button>
        </Note>
      )}
      {body}
    </div>
  );
};

/** The checkout's other conversations, collapsed so a busy main checkout doesn't drown the task's own. */
const Threads = (props: {
  threads: SessionSummary[];
  selected?: string;
  taskId: string;
  onSelect: (id: string) => void;
}) => {
  const { view } = useTaskPage();
  const [open, setOpen] = useState(props.selected !== undefined);
  const n = props.threads.length;
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground self-start"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Chevron /> {n} other conversation{n === 1 ? "" : "s"} here
      </Button>
      {open && (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {props.threads.map((s) => {
              const other = s.task && s.task.id !== props.taskId;
              return (
                <li
                  key={s.id}
                  className={cn(
                    "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm",
                    s.id === props.selected && "bg-accent/60"
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                    aria-current={s.id === props.selected ? "true" : undefined}
                    onClick={() => props.onSelect(s.id)}
                  >
                    {s.title || "Untitled conversation"}
                  </button>
                  <SessionBadge status={s.status} />
                  <When
                    at={s.updatedAt}
                    className="text-muted-foreground text-xs whitespace-nowrap"
                  />
                  {other && (
                    <Link
                      to={sessionPath(view, s)}
                      className="text-muted-foreground hover:text-foreground text-xs hover:underline"
                    >
                      Its task
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
};
