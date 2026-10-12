import type { ChatView } from "../../../shared/types";
import { Chip, muted } from "../../components/page";
import { StatusDot } from "../../components/status";
import { When } from "../../components/when";
import { Link } from "../../routing";
import { chatActivity, chatNeedsYou, chatPath, chatTone } from "./chat";

/**
 * One chat, linking to its view: its state, title, whether it started in opencode, its checkout and when it was last
 * active, and its project when the list spans several.
 */
export const ChatRow = (props: {
  projectId: string;
  chat: ChatView;
  /** Shown when the list spans projects. */
  projectName?: string;
}) => {
  const { chat } = props;
  const needsYou = chatNeedsYou(chat);
  return (
    <li className="border-t first:border-t-0">
      <Link
        className="hover:bg-muted/50 flex min-w-0 items-center gap-3 px-4 py-2"
        to={chatPath(props.projectId, chat.id)}
      >
        <StatusDot
          tone={chatTone(chat)}
          label={needsYou ? "Needs you" : undefined}
        />
        <span className="min-w-0 flex-1 truncate">
          {chat.title || "Untitled chat"}
        </span>
        {chat.origin === "opencode" && (
          <Chip title="Found in opencode; started outside opendevhub">
            started in opencode
          </Chip>
        )}
        <span className={muted}>
          {[props.projectName, chat.branch ?? "main checkout"]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <When
          at={chatActivity(chat)}
          className="text-muted-foreground text-xs whitespace-nowrap max-sm:hidden"
        />
      </Link>
    </li>
  );
};
