import { Input } from "@opendevhub/ui/input";

import { Choice } from "../../components/choice";
import {
  Empty,
  muted,
  Page,
  PageHeader,
  Section,
  Segmented,
} from "../../components/page";
import { useDash } from "../../dashboard-context";
import { matches } from "../../derive";
import { useSearchParams } from "../../routing";
import { matchesTaskFilter, projectTasks } from "../checkouts/checkouts";
import type { TaskFilter } from "../checkouts/checkouts";
import { TaskRow } from "./task-rows";

const CHIPS: { id: TaskFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs you" },
  { id: "running", label: "Working" },
  { id: "idle", label: "Idle" },
  { id: "ended", label: "Ended" },
  { id: "draft", label: "Drafts" },
];

/** The tasks of every project that aren't archived, grouped by project, with drafts in their own group first. */
export const TasksPage = () => {
  const { snapshot } = useDash();
  const [params, setParams] = useSearchParams();
  if (!snapshot) {
    return null;
  }

  const status = (params.get("status") ?? "all") as TaskFilter;
  const project = params.get("project") ?? "";
  const q = params.get("q") ?? "";
  const set = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value && value !== "all") {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      },
      { replace: true }
    );

  const groups = snapshot.projects
    .map((view) => ({ tasks: projectTasks(view), view }))
    .filter((g) => g.tasks.length > 0);
  const count = (f: TaskFilter) =>
    groups.reduce(
      (n, g) => n + g.tasks.filter((t) => matchesTaskFilter(t, f)).length,
      0
    );
  const filtered = groups
    .filter((g) => !project || g.view.project.id === project)
    .map((g) => ({
      ...g,
      tasks: g.tasks.filter(
        (t) =>
          matchesTaskFilter(t, status) &&
          matches(q, t.title, g.view.project.name)
      ),
    }));
  const drafts = filtered.flatMap((g) =>
    g.tasks.filter((t) => t.state === "draft").map((t) => ({ t, view: g.view }))
  );
  const shown = filtered
    .map((g) => ({ ...g, tasks: g.tasks.filter((t) => t.state !== "draft") }))
    .filter((g) => g.tasks.length > 0);

  let body;
  if (groups.length === 0) {
    body = (
      <Empty title="No tasks">
        <p className={muted}>
          Open a project and start a task, or make one from a chat.
        </p>
      </Empty>
    );
  } else if (shown.length === 0 && drafts.length === 0) {
    body = <p className={muted}>No tasks match these filters.</p>;
  } else {
    body = shown.map(({ view, tasks }) => (
      <Section
        key={view.project.id}
        title={view.project.name}
        hint={tasks.length}
      >
        <ul>
          {tasks.map((t) => (
            <TaskRow key={t.task} projectId={view.project.id} task={t} />
          ))}
        </ul>
      </Section>
    ));
  }

  return (
    <Page>
      <PageHeader
        title="Tasks"
        description="Every task across your projects, and what each needs"
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented
          label="State"
          value={status}
          onChange={(id) => set("status", id)}
          options={CHIPS.map((c) => ({
            id: c.id,
            label: (
              <>
                {c.label}{" "}
                <span className="text-muted-foreground text-xs tabular-nums">
                  {count(c.id)}
                </span>
              </>
            ),
          }))}
        />
        <Choice
          label="Project"
          size="default"
          value={project}
          onChange={(v) => set("project", v)}
          options={[
            { label: "All projects", value: "" },
            ...groups.map((g) => ({
              label: g.view.project.name,
              value: g.view.project.id,
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

      {drafts.length > 0 && (
        <Section title="Drafts" hint={drafts.length}>
          <ul>
            {drafts.map(({ t, view }) => (
              <TaskRow key={t.task} projectId={view.project.id} task={t}>
                <p className="text-muted-foreground px-4 pb-2 pl-9 text-xs">
                  {view.project.name}
                </p>
              </TaskRow>
            ))}
          </ul>
        </Section>
      )}
      {body}
    </Page>
  );
};
