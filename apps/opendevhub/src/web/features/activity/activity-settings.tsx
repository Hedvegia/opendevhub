import { useState } from "react";

import { Choice } from "../../components/choice";
import { useDash } from "../../dashboard-context";
import { SettingsHeader } from "../settings/settings-layout";
import { ActivityFeed } from "./activity-feed";

/** What happened across every project, or in one, newest first. */
export const ActivitySettings = () => {
  const { snapshot } = useDash();
  const [selected, setSelected] = useState("");
  const projects = snapshot?.projects.map((v) => v.project) ?? [];
  const projectId = projects.some((p) => p.id === selected)
    ? selected
    : undefined;
  return (
    <>
      <SettingsHeader
        title="Activity"
        description="Tasks started, variants failed, branches published, pull requests linked and reviews run, newest first."
        action={
          projects.length > 1 && (
            <Choice
              label="Project"
              value={projectId ?? ""}
              onChange={setSelected}
              options={[
                { label: "All projects", value: "" },
                ...projects.map((p) => ({ label: p.name, value: p.id })),
              ]}
            />
          )
        }
      />
      <ActivityFeed
        key={projectId ?? ""}
        filter={projectId ? { projectId } : {}}
        showProject={!projectId}
        empty="Nothing has happened yet. Start a task and it shows up here."
      />
    </>
  );
};
