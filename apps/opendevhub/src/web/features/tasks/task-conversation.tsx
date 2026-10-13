import { Empty, muted } from "../../components/page";
import { useSearchParams } from "../../routing";
import { SessionView } from "../sessions/session-page";
import type { PanelId } from "../sessions/side-panel";
import { useTaskPage } from "./task-context";
import { taskSessions } from "./tasks";
import { conversationCheckout, VariantWaiting } from "./variant-waiting";

/** The selected conversation of this task variant (`?thread=`). */
export const TaskConversation = ({
  initialPanel,
}: {
  initialPanel?: PanelId;
} = {}) => {
  const { view, task, variant } = useTaskPage();
  const [params, setParams] = useSearchParams();
  const threads = taskSessions(view, task.id)
    .filter((session) => session.task?.n === variant.n)
    .toSorted((a, b) => a.id.localeCompare(b.id));
  const own = threads.find((s) => s.id === variant.sessionId);
  const selected =
    threads.find((s) => s.id === params.get("thread")) ?? own ?? threads.at(-1);
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
        key={`${selected.id}:${initialPanel ?? ""}`}
        view={view}
        checkout={checkout}
        session={selected}
        showTask={selected.task?.id !== task.id}
        changes
        terminal
        runtime
        initialPanel={initialPanel}
        onStarted={select}
      />
    );
  } else {
    body =
      variant.sessionId && !variant.sessionRemoved ? (
        <Empty title="No open conversations">
          <p className={muted}>Use + to start a conversation in this task.</p>
        </Empty>
      ) : (
        <VariantWaiting view={view} variant={variant} />
      );
  }

  return <div className="flex min-h-0 flex-1 flex-col gap-4">{body}</div>;
};
