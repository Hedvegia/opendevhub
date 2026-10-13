import { Badge } from "@opendevhub/ui/badge";
import { ExternalLinkIcon } from "lucide-react";

import { chatHref, taskHref } from "../../../shared/urls";
import { useDash } from "../../dashboard-context";
import { Link } from "../../routing";
import { originLabel } from "./activity";
import type { Origin } from "./activity";
import { ENTITY_ICON } from "./entity-icons";

/** "Created by" for list rows: the task and variant, a chat, a manual action, a PR checkout, or outside opendevhub. */
export const CreatedByChip = (props: { origin: Origin; projectId: string }) => {
  const { forgejo } = useDash();
  const { origin } = props;
  const label = originLabel(origin, forgejo?.enabled ? forgejo.url : undefined);
  let { href } = label;
  if (origin.by === "variant") {
    href = taskHref(props.projectId, origin.task, { v: origin.n });
  } else if (origin.by === "session") {
    href = taskHref(props.projectId, origin.task);
  } else if (origin.by === "manual" && origin.chat) {
    href = chatHref(props.projectId, origin.chat.id);
  }
  const chat = origin.by === "chat" || (origin.by === "manual" && origin.chat);
  let Icon = ENTITY_ICON.task;
  if (origin.by === "pull") {
    Icon = ENTITY_ICON.pull_request;
  } else if (chat) {
    Icon = ENTITY_ICON.chat;
  }
  const plain =
    (origin.by === "manual" && !origin.chat) || origin.by === "unmanaged";
  const title = `Created by: ${label.text}`;
  const content = (
    <>
      {!plain && <Icon className="size-3" />}
      <span className="max-w-48 truncate">{label.text}</span>
    </>
  );
  if (href) {
    return (
      <Badge
        variant="outline"
        asChild
        className="gap-1 font-sans font-normal"
        title={title}
      >
        <Link to={href}>{content}</Link>
      </Badge>
    );
  }
  if (label.external) {
    return (
      <Badge
        variant="outline"
        asChild
        className="gap-1 font-sans font-normal"
        title={title}
      >
        <a href={label.external} target="_blank" rel="noopener noreferrer">
          {content}
          <ExternalLinkIcon className="size-3" />
        </a>
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-muted-foreground gap-1 font-sans font-normal"
      title={title}
    >
      {content}
    </Badge>
  );
};
