import { Button } from "@opendevhub/ui/button";
import { ProjectSidebar } from "@opendevhub/ui/project-sidebar";
import type {
  SidebarProject,
  SidebarProjectDetails,
} from "@opendevhub/ui/project-sidebar";
import { useLocation } from "@tanstack/react-router";
import { BellIcon, SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { STATE_LABEL } from "../components/status";
import { useDash } from "../dashboard-context";
import { attentionCounts, projectCounts, projectTone } from "../derive";
import type { Tone } from "../derive";
import {
  chatActivity,
  chatNeedsYou,
  chatPath,
  chatTone,
  shortAgo,
  sidebarChats,
} from "../features/chat/chat";
import {
  checkoutPath,
  checkouts,
  checkoutTone,
} from "../features/checkouts/checkouts";
import {
  projectPullsHref,
  projectTicketsHref,
  useProjectLinks,
} from "../features/projects/links-settings";
import { useSettingsHref } from "../features/settings/settings-link";
import { useNavigate, useSearchParams } from "../routing";
import { useCurrentProject } from "./current-project";

const activityOf = (
  tone: Tone
): "attention" | "running" | "healthy" | "idle" => {
  if (tone === "attention" || tone === "error") {
    return "attention";
  }
  if (tone === "running" || tone === "busy") {
    return "running";
  }
  return tone === "ok" ? "healthy" : "idle";
};

const shortName = (name: string): string => {
  const words = name.split(/[-_\s]+/u).filter(Boolean);
  return words.length > 1
    ? words
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toLowerCase()
    : name.slice(0, 2).toLowerCase();
};

const globalPageOf = (pathname: string) => {
  if (pathname === "/") {
    return "inbox";
  }
  if (pathname === "/tasks") {
    return "tasks";
  }
  if (pathname === "/chats" || pathname.startsWith("/chat")) {
    return "chats";
  }
  if (pathname.startsWith("/forgejo")) {
    return "pullRequests";
  }
  if (pathname.startsWith("/jira")) {
    return "tickets";
  }
  return undefined;
};

export const DesktopSidebar = () => {
  const { snapshot, connected, permission, requestPermission, openAddProject } =
    useDash();
  const { view, projects, choose } = useCurrentProject();
  const navigate = useNavigate();
  const settingsHref = useSettingsHref();
  const [params] = useSearchParams();
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState(view?.project.id);
  const selectedView =
    projects.find(
      (projectView) => projectView.project.id === selectedProjectId
    ) ?? view;
  const links = useProjectLinks(selectedView?.project.id).data;
  const { pathname } = useLocation();

  useEffect(() => {
    setSelectedProjectId(view?.project.id);
    setPanelOpen(true);
  }, [view?.project.id]);

  if (!snapshot) {
    return null;
  }

  const sidebarProjects: SidebarProject[] = projects.map((projectView) => ({
    id: projectView.project.id,
    name: projectView.project.name,
    shortName: shortName(projectView.project.name),
    activity:
      projectView.runtime.containerState === "running"
        ? activityOf(projectTone(projectView))
        : undefined,
    count: projectCounts(projectView).attention,
  }));
  const activeProjectId = selectedView?.project.id;
  const repository = links?.forgejoRepository;
  const ticketsLinked = !!(links?.jiraBoard || links?.jiraJql);
  const runningContainers = selectedView
    ? Number(selectedView.runtime.containerState === "running") +
      selectedView.environments.filter(
        (environment) => environment.runtime.containerState === "running"
      ).length
    : 0;
  const projectDetails: SidebarProjectDetails | undefined = selectedView
    ? {
        status: `${STATE_LABEL[selectedView.runtime.containerState]} · ${runningContainers} ${runningContainers === 1 ? "container" : "containers"}`,
        statusActivity: activityOf(projectTone(selectedView)),
        newChatHref: "/chat",
        pages: {
          overview: {
            href: `/p/${encodeURIComponent(selectedView.project.id)}`,
          },
          pullRequests: {
            href: repository ? projectPullsHref(repository) : "/forgejo",
          },
          tickets: {
            href: links && ticketsLinked ? projectTicketsHref(links) : "/jira",
          },
        },
        activePage:
          pathname === `/p/${encodeURIComponent(selectedView.project.id)}`
            ? "overview"
            : undefined,
        worktrees: checkouts(selectedView)
          .slice(1)
          .map((checkout) => ({
            id: checkout.directory,
            label: checkout.label,
            href: checkoutPath(selectedView.project.id, checkout.target),
            active:
              pathname ===
              checkoutPath(selectedView.project.id, checkout.target),
            activity: activityOf(
              checkoutTone(selectedView, checkout.directory)
            ),
          })),
        chats: sidebarChats(selectedView).map((chat) => ({
          id: chat.id,
          label: chat.title || "Untitled chat",
          href: chatPath(selectedView.project.id, chat.id),
          active: pathname === chatPath(selectedView.project.id, chat.id),
          activity: activityOf(
            chatNeedsYou(chat) ? "attention" : chatTone(chat)
          ),
          meta: shortAgo(chatActivity(chat)),
        })),
        onAddChat: () => void navigate("/chat"),
      }
    : undefined;
  const globalPage = globalPageOf(pathname);

  return (
    <div className="sticky top-0 hidden h-svh shrink-0 md:block">
      <ProjectSidebar
        globalLinks={{
          inbox: { href: "/", count: attentionCounts(snapshot).attention },
          tasks: { href: "/tasks" },
          chats: { href: "/chats" },
          pullRequests: { href: "/forgejo" },
          tickets: { href: "/jira" },
        }}
        activeGlobalPage={globalPage}
        projects={sidebarProjects}
        onSelectProject={(projectId) => {
          setSelectedProjectId(projectId);
          setPanelOpen(true);
          if (activeProjectId !== projectId) {
            choose(projectId);
          }
        }}
        onAddProject={openAddProject}
        onNavigate={(href) => void navigate(href)}
        footer={
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Settings"
              aria-current={params.has("settings") ? "page" : undefined}
              title="Settings"
              onClick={() => void navigate(settingsHref())}
            >
              <SettingsIcon />
            </Button>
            {permission === "default" && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Enable notifications"
                title="Enable notifications"
                onClick={() => void requestPermission()}
              >
                <BellIcon />
              </Button>
            )}
            <span
              className={`mb-1 size-2 rounded-full ${connected ? "bg-ok" : "bg-warn animate-pulse"}`}
              role="img"
              aria-label={connected ? "Connected" : "Reconnecting"}
              title={connected ? "Connected" : "Reconnecting"}
            />
          </div>
        }
        {...(panelOpen && activeProjectId && projectDetails
          ? {
              activeProjectId,
              projectDetails,
              onCloseProject: () => setPanelOpen(false),
            }
          : {})}
      />
    </div>
  );
};
