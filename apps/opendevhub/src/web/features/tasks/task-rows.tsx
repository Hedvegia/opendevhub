import type { ReactNode } from "react";

import { taskHref } from "../../../shared/urls";
import { Chip, muted } from "../../components/page";
import { StatusDot } from "../../components/status";
import { Link } from "../../routing";
import type { ProjectTask } from "../checkouts/checkouts";

/** What a task row says it holds: a conversation, an AI review, or its variants. */
const taskSize = (t: ProjectTask): string => {
  if (t.kind === "manual") {
    return "conversation";
  }
  if (t.kind === "review") {
    return "AI review";
  }
  return `${t.variants} variant${t.variants === 1 ? "" : "s"}`;
};

export const taskTone = (t: {
  attention: boolean;
  running: boolean;
}): "attention" | "running" | "ok" => {
  if (t.attention) {
    return "attention";
  }
  return t.running ? "running" : "ok";
};

/**
 * One task, linking to its page: to the conversation that waits on the user when one does. A manual task found in
 * opencode says it started there.
 */
export const TaskRow = (props: {
  projectId: string;
  task: ProjectTask;
  action?: ReactNode;
  children?: ReactNode;
}) => {
  const { task: t } = props;
  return (
    <li className="border-t first:border-t-0">
      <div className="hover:bg-muted/50 flex items-center">
        <Link
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2"
          to={taskHref(
            props.projectId,
            t.task,
            t.waiting === undefined ? {} : { v: t.waiting }
          )}
        >
          <StatusDot tone={t.state === "ended" ? "off" : taskTone(t)} />
          <span className="flex-1 truncate">{t.title || "Task"}</span>
          {t.adopted && (
            <Chip title="Found in opencode; started outside opendevhub">
              started in opencode
            </Chip>
          )}
          <span className={muted}>
            {t.state === "starting" && "starting · "}
            {taskSize(t)}
          </span>
        </Link>
        {props.action && <span className="pr-3">{props.action}</span>}
      </div>
      {props.children}
    </li>
  );
};
