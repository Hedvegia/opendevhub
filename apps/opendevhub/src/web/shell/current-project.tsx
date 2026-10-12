import { useLocation } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import type { ProjectView } from "../../shared/types";
import { useDash } from "../dashboard-context";
import {
  chatProjects,
  defaultChatProject,
  readLastProject,
  rememberProject,
} from "../features/chat/chat";
import { useSearchParams } from "../routing";

const CHAT_PATH = /^\/chat\/(?<project>[^/]+)\//u;
const PROJECT_PATH = /^\/p\/(?<project>[^/]+)/u;

/** The project a page is about: in its path (`/p/:project`, `/chat/:project/:chat`), else its `?project=`. */
export const projectInLocation = (
  pathname: string,
  params: URLSearchParams
): string | undefined => {
  const m = pathname.match(CHAT_PATH) ?? pathname.match(PROJECT_PATH);
  if (m?.groups?.project) {
    return decodeURIComponent(m.groups.project);
  }
  return params.get("project") ?? undefined;
};

interface CurrentProject {
  /** Undefined only while no project is registered. */
  view: ProjectView | undefined;
  projects: ProjectView[];
  choose: (projectId: string) => void;
}

const Context = createContext<CurrentProject>({
  choose: () => undefined,
  projects: [],
  view: undefined,
});

/**
 * The project the sidebar and Chat's start page work in: the one the open page is about, else the one last
 * picked on this browser, else the first by name. Opening a page about a project makes it the picked one.
 */
export const CurrentProjectProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const { snapshot } = useDash();
  const location = useLocation();
  const [params] = useSearchParams();
  const [picked, setPicked] = useState(readLastProject);
  const projects = snapshot ? chatProjects(snapshot) : [];
  const fromLocation = projectInLocation(location.pathname, params);
  const known = projects.some((v) => v.project.id === fromLocation);

  useEffect(() => {
    if (fromLocation && known) {
      setPicked(fromLocation);
      rememberProject(fromLocation);
    }
  }, [fromLocation, known]);

  const value: CurrentProject = {
    choose: (projectId) => {
      setPicked(projectId);
      rememberProject(projectId);
    },
    projects,
    view: defaultChatProject(projects, known ? fromLocation : picked),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export const useCurrentProject = (): CurrentProject => useContext(Context);
