import { Button } from "@opendevhub/ui/button";
import { Input } from "@opendevhub/ui/input";

import { Choice } from "../../components/choice";
import { Empty, muted, Page, PageHeader, Section } from "../../components/page";
import { useDash } from "../../dashboard-context";
import { matches } from "../../derive";
import { Link, useSearchParams } from "../../routing";
import { allChats } from "./chat";
import { ChatRow } from "./chat-rows";

/** Every chat across projects, most recently active first, filterable by project (`?project=`) and title (`?q=`). */
export const ChatsPage = () => {
  const { snapshot } = useDash();
  const [params, setParams] = useSearchParams();
  if (!snapshot) {
    return null;
  }
  const project = params.get("project") ?? "";
  const q = params.get("q") ?? "";
  const set = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      },
      { replace: true }
    );
  const every = allChats(snapshot);
  const shown = every.filter(
    (c) =>
      (!project || c.projectId === project) &&
      matches(q, c.chat.title, c.projectName)
  );
  const projects = snapshot.projects
    .filter((v) => v.chats.length > 0)
    .toSorted((a, b) => a.project.name.localeCompare(b.project.name));

  let body;
  if (every.length === 0) {
    body = (
      <Empty title="No chats">
        <p className={muted}>
          Start one from Chat, or in a checkout. Conversations started in
          opencode show up here too.
        </p>
        <Button asChild variant="outline">
          <Link to="/chat">New chat</Link>
        </Button>
      </Empty>
    );
  } else if (shown.length === 0) {
    body = <p className={muted}>No chats match these filters.</p>;
  } else {
    body = (
      <Section title="Chats" hint={shown.length}>
        <ul>
          {shown.map((c) => (
            <ChatRow
              key={c.chat.id}
              projectId={c.projectId}
              chat={c.chat}
              {...(project ? {} : { projectName: c.projectName })}
            />
          ))}
        </ul>
      </Section>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Chats"
        description="Conversations in your projects' checkouts that aren't tasks"
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Choice
          label="Project"
          size="default"
          value={project}
          onChange={(v) => set("project", v)}
          options={[
            { label: "All projects", value: "" },
            ...projects.map((v) => ({
              label: v.project.name,
              value: v.project.id,
            })),
          ]}
        />
        <Input
          className="w-56 max-md:w-full md:ml-auto"
          placeholder="Search titles…"
          value={q}
          onChange={(e) => set("q", e.target.value)}
        />
      </div>
      {body}
    </Page>
  );
};
