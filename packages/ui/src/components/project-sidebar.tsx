import {
  Folder,
  GitBranch,
  GitPullRequest,
  Inbox,
  MessageSquare,
  Plus,
  SquareCheckBig,
  SquarePen,
  Ticket,
  X,
} from "lucide-react";
import type { ComponentProps, MouseEvent, ReactNode } from "react";

import { cn } from "../utils";

type GlobalPage = "inbox" | "tasks" | "chats" | "pullRequests" | "tickets";
type ProjectPage = "overview" | "pullRequests" | "tickets";
type Activity = "attention" | "running" | "healthy" | "idle";

interface SidebarGlobalLink {
  href: string;
  count?: number;
}

interface SidebarProject {
  id: string;
  name: string;
  shortName: string;
  activity?: Activity;
  count?: number;
}

interface SidebarEntry {
  id: string;
  label: string;
  href: string;
  active?: boolean;
  activity?: Activity;
  meta?: string;
}

interface SidebarProjectDetails {
  status?: string;
  statusActivity?: Activity;
  newChatHref?: string;
  pages: Record<ProjectPage, SidebarGlobalLink>;
  activePage?: ProjectPage;
  worktrees?: readonly SidebarEntry[];
  chats?: readonly SidebarEntry[];
  onAddChat?: () => void;
}

type ProjectSidebarProps = Omit<ComponentProps<"aside">, "children"> & {
  globalLinks: Record<GlobalPage, SidebarGlobalLink>;
  activeGlobalPage?: GlobalPage;
  projects: readonly SidebarProject[];
  onSelectProject: (projectId: string) => void;
  onAddProject?: () => void;
  onNavigate?: (href: string) => void;
  activeProjectId?: string;
  projectDetails?: SidebarProjectDetails;
  onCloseProject?: () => void;
  footer?: ReactNode;
};

const handleLinkClick = (
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
  onNavigate?: (href: string) => void
) => {
  if (
    !onNavigate ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  onNavigate(href);
};

const globalPages = [
  { id: "inbox", label: "Inbox / Dashboard", icon: Inbox },
  { id: "tasks", label: "Tasks", icon: SquareCheckBig },
  { id: "chats", label: "Chats", icon: MessageSquare },
  { id: "pullRequests", label: "Pull requests", icon: GitPullRequest },
  { id: "tickets", label: "Tickets", icon: Ticket },
] as const;

const projectPages = [
  { id: "overview", label: "Overview", icon: Folder },
  { id: "pullRequests", label: "Pull requests", icon: GitPullRequest },
  { id: "tickets", label: "Tickets", icon: Ticket },
] as const;

const activityColors: Record<Activity, string> = {
  attention: "bg-attention",
  running: "bg-running",
  healthy: "bg-ok",
  idle: "border border-muted-foreground bg-transparent",
};

const ActivityDot = ({ activity }: { activity: Activity }) => (
  <span
    aria-hidden="true"
    className={cn("size-2 shrink-0 rounded-full", activityColors[activity])}
  />
);

const SidebarEntries = ({
  kind,
  entries,
  addAction,
  onNavigate,
}: {
  kind: "worktrees" | "chats";
  entries: readonly SidebarEntry[];
  addAction?: () => void;
  onNavigate?: (href: string) => void;
}) => {
  const label = kind === "worktrees" ? "Worktrees" : "Chats";
  return (
    <section aria-label={label} className="mt-5 min-w-0">
      <div className="text-muted-foreground flex items-center justify-between px-3 text-xs">
        <span>{label}</span>
        <span className="flex items-center gap-2">
          <span>{entries.length}</span>
          {addAction && (
            <button
              type="button"
              aria-label="Add chat"
              onClick={addAction}
              className="hover:bg-sidebar-accent focus-visible:ring-sidebar-ring rounded p-0.5 outline-none focus-visible:ring-2"
            >
              <Plus className="size-3.5" />
            </button>
          )}
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a
              href={entry.href}
              onClick={(event) =>
                handleLinkClick(event, entry.href, onNavigate)
              }
              aria-current={entry.active ? "page" : undefined}
              className={cn(
                "text-sidebar-foreground hover:bg-sidebar-accent focus-visible:ring-sidebar-ring flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] outline-none focus-visible:ring-2",
                entry.active && "bg-sidebar-accent"
              )}
            >
              {kind === "worktrees" ? (
                <GitBranch
                  aria-hidden="true"
                  className="text-muted-foreground size-3.5 shrink-0"
                />
              ) : (
                <ActivityDot activity={entry.activity ?? "idle"} />
              )}
              <span className="min-w-0 flex-1 truncate" title={entry.label}>
                {entry.label}
              </span>
              {entry.activity && kind === "worktrees" && (
                <ActivityDot activity={entry.activity} />
              )}
              {entry.meta && (
                <span className="text-muted-foreground shrink-0 text-xs">
                  {entry.meta}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
};

const ProjectSidebar = ({
  globalLinks,
  activeGlobalPage,
  projects,
  activeProjectId,
  onSelectProject,
  onAddProject,
  onNavigate,
  onCloseProject,
  projectDetails,
  footer,
  className,
  ...props
}: ProjectSidebarProps) => {
  const activeProject = projects.find(
    (project) => project.id === activeProjectId
  );

  return (
    <aside
      data-slot="project-sidebar"
      className={cn(
        "bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full min-h-0 w-fit max-w-full overflow-hidden border-r",
        className
      )}
      {...props}
    >
      <div className="border-sidebar-border flex w-14 shrink-0 flex-col items-center border-r py-3">
        <nav aria-label="Global pages" className="w-full px-2">
          <ul className="space-y-1">
            {globalPages.map(({ id, label, icon: Icon }) => {
              const link = globalLinks[id];
              return (
                <li key={id}>
                  <a
                    href={link.href}
                    onClick={(event) =>
                      handleLinkClick(event, link.href, onNavigate)
                    }
                    aria-label={label}
                    aria-current={activeGlobalPage === id ? "page" : undefined}
                    title={label}
                    className={cn(
                      "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring relative flex size-10 items-center justify-center rounded-lg outline-none focus-visible:ring-2",
                      activeGlobalPage === id &&
                        "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {Boolean(link.count) && (
                      <span className="bg-attention text-attention-foreground absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
                        {link.count}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="bg-sidebar-border my-3 h-px w-8 shrink-0" />

        <nav
          aria-label="Projects"
          className="min-h-0 w-full flex-1 overflow-y-auto px-2"
        >
          <ul className="space-y-2">
            {projects.map((project) => {
              const isActive = project.id === activeProjectId;
              const hasNotifications = (project.count ?? 0) > 0;
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    aria-label={project.name}
                    aria-expanded={isActive && Boolean(projectDetails)}
                    title={project.name}
                    onClick={() => onSelectProject(project.id)}
                    className={cn(
                      "bg-sidebar-accent text-sidebar-accent-foreground focus-visible:ring-sidebar-ring relative flex size-10 items-center justify-center rounded-lg text-[13px] font-semibold outline-none focus-visible:ring-2",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "hover:bg-sidebar-accent/70"
                    )}
                  >
                    <span className="max-w-full truncate px-1">
                      {project.shortName}
                    </span>
                    {hasNotifications && (
                      <span
                        aria-hidden="true"
                        className="bg-attention text-attention-foreground absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                      >
                        {project.count}
                      </span>
                    )}
                    {!hasNotifications &&
                      project.activity &&
                      project.activity !== "idle" && (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "border-sidebar absolute -top-1 -right-1 size-3 rounded-full border-2",
                            activityColors[project.activity]
                          )}
                        />
                      )}
                    {hasNotifications && (
                      <span className="sr-only">
                        {project.count} notifications
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            {onAddProject && (
              <li>
                <button
                  type="button"
                  aria-label="Add project"
                  title="Add project"
                  onClick={onAddProject}
                  className="text-muted-foreground hover:bg-sidebar-accent focus-visible:ring-sidebar-ring border-sidebar-border flex size-10 items-center justify-center rounded-lg border border-dashed outline-none focus-visible:ring-2"
                >
                  <Plus aria-hidden="true" className="size-4" />
                </button>
              </li>
            )}
          </ul>
        </nav>
        {footer && <div className="mt-3 shrink-0">{footer}</div>}
      </div>

      {activeProject && projectDetails && (
        <div className="flex min-h-0 w-72 min-w-0 flex-col">
          <div className="border-sidebar-border relative border-b px-5 py-5 pr-11">
            {onCloseProject && (
              <button
                type="button"
                aria-label="Close project sidebar"
                title="Close project sidebar"
                onClick={onCloseProject}
                className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring absolute top-4 right-3 flex size-6 items-center justify-center rounded-md outline-none focus-visible:ring-2"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            )}
            <p className="text-muted-foreground text-xs">Project</p>
            <p
              className="mt-1 truncate text-sm font-semibold"
              title={activeProject.name}
            >
              {activeProject.name}
            </p>
            {projectDetails.status && (
              <p className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
                {projectDetails.statusActivity && (
                  <ActivityDot activity={projectDetails.statusActivity} />
                )}
                {projectDetails.status}
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            {projectDetails.newChatHref && (
              <a
                href={projectDetails.newChatHref}
                onClick={(event) =>
                  handleLinkClick(
                    event,
                    projectDetails.newChatHref ?? "",
                    onNavigate
                  )
                }
                className="text-sidebar-foreground hover:bg-sidebar-accent focus-visible:ring-sidebar-ring flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] outline-none focus-visible:ring-2"
              >
                <SquarePen aria-hidden="true" className="size-3.5" />
                New chat
              </a>
            )}
            <nav aria-label={`${activeProject.name} pages`} className="mt-2">
              <ul className="space-y-1">
                {projectPages.map(({ id, label, icon: Icon }) => {
                  const link = projectDetails.pages[id];
                  return (
                    <li key={id}>
                      <a
                        href={link.href}
                        onClick={(event) =>
                          handleLinkClick(event, link.href, onNavigate)
                        }
                        aria-current={
                          projectDetails.activePage === id ? "page" : undefined
                        }
                        className={cn(
                          "text-sidebar-foreground hover:bg-sidebar-accent focus-visible:ring-sidebar-ring flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] outline-none focus-visible:ring-2",
                          projectDetails.activePage === id &&
                            "bg-sidebar-accent font-medium"
                        )}
                      >
                        <Icon
                          aria-hidden="true"
                          className="size-3.5 shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        {link.count !== undefined && link.count > 0 && (
                          <span className="text-muted-foreground text-xs">
                            {link.count}
                          </span>
                        )}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {projectDetails.worktrees && (
              <SidebarEntries
                kind="worktrees"
                entries={projectDetails.worktrees}
                onNavigate={onNavigate}
              />
            )}
            {projectDetails.chats && (
              <SidebarEntries
                kind="chats"
                entries={projectDetails.chats}
                addAction={projectDetails.onAddChat}
                onNavigate={onNavigate}
              />
            )}
          </div>
        </div>
      )}
    </aside>
  );
};

export { ProjectSidebar };
export type {
  GlobalPage,
  ProjectPage,
  ProjectSidebarProps,
  SidebarEntry,
  SidebarGlobalLink,
  SidebarProject,
  SidebarProjectDetails,
};
