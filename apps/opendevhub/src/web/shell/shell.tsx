import { Outlet, useLocation } from "@tanstack/react-router";
import {
  BellIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  CircleDollarSignIcon,
  EraserIcon,
  FolderGit2Icon,
  GitPullRequestIcon,
  LayoutGridIcon,
  ListTodoIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SquarePenIcon,
  TicketIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { ProjectView } from "../../shared/types";
import { Count, StatusDot, TONE_LABEL } from "../components/status";
import { useDash } from "../dashboard-context";
import { attentionCounts, projectTone } from "../derive";
import {
  SIDEBAR_CHATS,
  chatActivity,
  chatNeedsYou,
  chatPath,
  chatTone,
  shortAgo,
  sidebarChats,
} from "../features/chat/chat";
import { projectTasks } from "../features/checkouts/checkouts";
import { nodesNeedingAttention } from "../features/nodes/nodes";
import { AddProjectDialog } from "../features/projects/add-project-dialog";
import { SettingsDialog } from "../features/settings/settings-dialog";
import {
  SETTINGS_PARAM,
  useSettingsHref,
} from "../features/settings/settings-link";
import { NewTaskDialog } from "../features/tasks/new-task-dialog";
import { formatCost, newTaskShortcut } from "../features/tasks/tasks";
import { Link, useIsActive, useNavigate, useSearchParams } from "../routing";
import { CommandPalette } from "./command-palette";
import { CurrentProjectProvider, useCurrentProject } from "./current-project";
import { Logo } from "./logo";
import { RightSidebarHost } from "./right-sidebar";

const NavItem = (props: {
  to: string;
  end?: boolean;
  /** Overrides whether the route makes the item active. */
  active?: boolean;
  children: ReactNode;
  badge?: ReactNode;
}) => {
  const routeActive = useIsActive(props.to, props.end);
  const active = props.active ?? routeActive;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active}>
        <Link to={props.to} activeOptions={{ exact: props.end }}>
          {props.children}
        </Link>
      </SidebarMenuButton>
      {props.badge && <SidebarMenuBadge>{props.badge}</SidebarMenuBadge>}
    </SidebarMenuItem>
  );
};

/** The project picker: the project the sidebar lists chats of, and the pages about every project. */
const ProjectPicker = () => {
  const { openAddProject, forgejo, jira } = useDash();
  const { view, projects, choose } = useCurrentProject();
  const navigate = useNavigate();
  const tone = view ? projectTone(view) : "off";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent"
              title={
                view ? `${view.project.name} — ${TONE_LABEL[tone]}` : undefined
              }
            >
              <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-content-center rounded-md">
                <Logo size={16} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="text-muted-foreground text-xs">Project</span>
                <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                  <span className="truncate">
                    {view?.project.name ?? "No project"}
                  </span>
                  {view && <StatusDot tone={tone} />}
                </span>
              </span>
              <ChevronsUpDownIcon className="text-muted-foreground ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Projects
            </DropdownMenuLabel>
            {projects.map((v) => (
              <DropdownMenuItem
                key={v.project.id}
                onSelect={() => {
                  choose(v.project.id);
                  void navigate("/chat");
                }}
              >
                <StatusDot tone={projectTone(v)} />
                <span className="min-w-0 flex-1 truncate">
                  {v.project.name}
                </span>
                {v.project.id === view?.project.id && <CheckIcon />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={openAddProject}>
              <PlusIcon /> Add project
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {view && (
              <DropdownMenuItem asChild>
                <Link to={`/p/${encodeURIComponent(view.project.id)}`}>
                  <FolderGit2Icon /> Project overview
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link to="/">
                <LayoutGridIcon /> All projects
              </Link>
            </DropdownMenuItem>
            {forgejo?.enabled && (
              <DropdownMenuItem asChild>
                <Link to="/forgejo">
                  <GitPullRequestIcon /> Pull requests
                </Link>
              </DropdownMenuItem>
            )}
            {jira?.enabled && (
              <DropdownMenuItem asChild>
                <Link to="/jira">
                  <TicketIcon /> Tickets
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

/** The current project's chats, most recently active first, marked when one waits on the user. */
const ProjectChats = ({ view }: { view: ProjectView }) => {
  const location = useLocation();
  const chats = sidebarChats(view);
  const shown = chats.slice(0, SIDEBAR_CHATS);
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="justify-between pr-8">
        <span>Chats</span>
        <span>{chats.length}</span>
      </SidebarGroupLabel>
      <SidebarGroupAction title="New chat" aria-label="New chat" asChild>
        <Link to="/chat">
          <PlusIcon />
        </Link>
      </SidebarGroupAction>
      <SidebarMenu>
        {shown.map((chat) => {
          const to = chatPath(view.project.id, chat.id);
          const needsYou = chatNeedsYou(chat);
          const title = chat.title || "Untitled chat";
          return (
            <SidebarMenuItem key={chat.id}>
              <SidebarMenuButton
                asChild
                isActive={location.pathname === to}
                title={`${title}${chat.branch ? ` — ${chat.branch}` : ""}${needsYou ? " — needs you" : ""}`}
              >
                <Link to={to}>
                  <StatusDot
                    tone={needsYou ? "attention" : chatTone(chat)}
                    label={needsYou ? "Needs you" : undefined}
                  />
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {shortAgo(chatActivity(chat))}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
        {chats.length === 0 && (
          <p className="text-muted-foreground px-2 py-1 text-sm">
            No chats in this project yet.
          </p>
        )}
        {chats.length > shown.length && (
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="sm">
              <Link
                to={`/chats?project=${encodeURIComponent(view.project.id)}`}
              >
                <span className="text-muted-foreground text-xs">
                  Show all {chats.length}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
};

/** One icon button in the sidebar's footer, with a tooltip and an optional dot. */
const FooterButton = (props: {
  label: string;
  to?: string;
  onClick?: () => void;
  dot?: boolean;
  active?: boolean;
  children: ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        asChild={props.to !== undefined}
        variant="ghost"
        size="icon-sm"
        aria-label={props.label}
        className={cn(
          "text-muted-foreground relative",
          props.active && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
        onClick={props.onClick}
      >
        {props.to === undefined ? (
          props.children
        ) : (
          <Link to={props.to}>
            {props.children}
            {props.dot && (
              <span className="bg-attention absolute top-1 right-1 size-1.5 rounded-full" />
            )}
          </Link>
        )}
      </Button>
    </TooltipTrigger>
    <TooltipContent side="top">{props.label}</TooltipContent>
  </Tooltip>
);

const AppSidebar = ({ onSearch }: { onSearch: () => void }) => {
  const { snapshot, connected, permission, requestPermission } = useDash();
  const { view } = useCurrentProject();
  const { setOpenMobile } = useSidebar();
  const [params] = useSearchParams();
  const settingsHref = useSettingsHref();
  const location = useLocation();

  // oxlint-disable-next-line react/exhaustive-effect-dependencies
  useEffect(() => setOpenMobile(false), [location.pathname, setOpenMobile]);

  if (!snapshot) {
    return null;
  }
  const tasksWaiting = view
    ? projectTasks(view).filter((t) => t.attention).length
    : 0;
  const tasksTo = view
    ? `/tasks?project=${encodeURIComponent(view.project.id)}`
    : "/tasks";
  const remotes = nodesNeedingAttention(snapshot.nodes);
  const isMac =
    typeof navigator !== "undefined" && /mac/iu.test(navigator.platform);

  return (
    <Sidebar>
      <SidebarHeader>
        <ProjectPicker />
        <SidebarMenu>
          <NavItem to="/chat" end>
            <SquarePenIcon /> New chat
          </NavItem>
          <NavItem
            to={tasksTo}
            active={location.pathname === "/tasks"}
            badge={
              tasksWaiting > 0 && <Count n={tasksWaiting} tone="attention" />
            }
          >
            <ListTodoIcon /> Tasks
          </NavItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSearch}>
              <SearchIcon /> <span className="flex-1">Jump to…</span>
              <Kbd>{isMac ? "⌘" : "Ctrl"} K</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {view ? (
          <ProjectChats view={view} />
        ) : (
          <p className="text-muted-foreground px-4 py-2 text-sm">
            Add a project to start chatting.
          </p>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t">
        <div className="flex items-center gap-0.5">
          <FooterButton
            label={
              remotes > 0
                ? "Settings — a remote instance needs attention"
                : "Settings"
            }
            to={settingsHref()}
            active={params.has(SETTINGS_PARAM)}
            dot={remotes > 0}
          >
            <SettingsIcon />
          </FooterButton>
          <FooterButton
            label={
              snapshot.usage
                ? `Usage — ${formatCost(snapshot.usage.today.cost)} today`
                : "Usage"
            }
            to="/usage"
            active={location.pathname === "/usage"}
          >
            <CircleDollarSignIcon />
          </FooterButton>
          <FooterButton
            label="Cleanup"
            to="/cleanup"
            active={location.pathname === "/cleanup"}
          >
            <EraserIcon />
          </FooterButton>
          {permission === "default" && (
            <FooterButton
              label="Enable notifications"
              onClick={() => void requestPermission()}
            >
              <BellIcon />
            </FooterButton>
          )}
          <div
            className="text-muted-foreground ml-auto flex items-center gap-2 px-2 text-xs"
            title={connected ? "Connected to opendevhub" : "Reconnecting…"}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                connected ? "bg-ok" : "bg-warn animate-pulse"
              )}
            />{" "}
            {connected ? "Live" : "Reconnecting…"}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

const MobileBar = ({ onSearch }: { onSearch: () => void }) => {
  const { snapshot } = useDash();
  const counts = snapshot ? attentionCounts(snapshot) : undefined;
  return (
    <header className="bg-sidebar sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-2 md:hidden">
      <SidebarTrigger aria-label="Open menu" />
      <span className="inline-flex flex-1 items-center gap-1.5 font-semibold">
        <Logo size={14} /> opendevhub
      </span>
      {counts && <Count n={counts.attention} tone="attention" />}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Search"
        onClick={onSearch}
      >
        <SearchIcon />
      </Button>
    </header>
  );
};

const Banners = () => {
  const { snapshot, connected, error, dismissError } = useDash();
  const banners = [
    !connected && (
      <Alert key="conn" className="border-warn/40 bg-warn/10 text-warn">
        <AlertDescription className="text-warn">
          Lost connection to opendevhub — retrying…
        </AlertDescription>
      </Alert>
    ),
    ...(snapshot?.preflight.errors ?? []).map((e) => (
      <Alert key={e} variant="destructive">
        <AlertDescription>{e}</AlertDescription>
      </Alert>
    )),
    error && (
      <Alert
        key="error"
        variant="destructive"
        className="flex items-center justify-between gap-4"
      >
        <AlertDescription>{error}</AlertDescription>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss"
          onClick={dismissError}
        >
          <XIcon />
        </Button>
      </Alert>
    ),
  ].filter(Boolean);
  if (banners.length === 0) {
    return null;
  }
  return <div className="flex flex-col gap-2 px-4 pt-4 md:px-8">{banners}</div>;
};

export const Shell = () => {
  const { snapshot, connected, newTask, newTaskFor, addProjectOpen } =
    useDash();
  const [palette, setPalette] = useState(false);
  const location = useLocation();
  const [params] = useSearchParams();
  const settingsOpen = params.has(SETTINGS_PARAM);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      const projectId = newTaskShortcut(e, location.pathname);
      if (
        projectId &&
        !palette &&
        !settingsOpen &&
        !newTaskFor &&
        !addProjectOpen
      ) {
        e.preventDefault();
        newTask(projectId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    palette,
    settingsOpen,
    newTaskFor,
    addProjectOpen,
    newTask,
    location.pathname,
  ]);

  if (!snapshot) {
    return (
      <div className="grid h-full place-content-center justify-items-center gap-3">
        <div className="border-border border-t-foreground size-5 animate-spin rounded-full border-2" />
        <p className="text-muted-foreground">
          {connected ? "Loading…" : "Connecting to opendevhub…"}
        </p>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <CurrentProjectProvider>
        <AppSidebar onSearch={() => setPalette(true)} />
        <RightSidebarHost>
          <SidebarInset className="min-w-0">
            <MobileBar onSearch={() => setPalette(true)} />
            <Banners />
            <div className="px-4 pt-4 pb-12 md:px-8 md:pt-6 md:pb-16">
              <Outlet />
            </div>
          </SidebarInset>
        </RightSidebarHost>
        <CommandPalette open={palette} onClose={() => setPalette(false)} />
        <NewTaskDialog />
        <AddProjectDialog />
        <SettingsDialog />
      </CurrentProjectProvider>
    </SidebarProvider>
  );
};
