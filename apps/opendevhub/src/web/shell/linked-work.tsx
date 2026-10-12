import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import type { ProjectLinks, ProjectView } from "../../shared/types";
import { fetchJiraTickets } from "../api";
import { useDash } from "../dashboard-context";
import { useJiraQuery } from "../features/jira/use-jira";
import {
  projectTicketsHref,
  projectTicketsQuery,
  useProjectLinks,
} from "../features/projects/links-settings";
import { Link } from "../routing";

/** How many open tickets the sidebar lists before "Show all". */
const SHOWN = 5;

interface Item {
  key: string;
  to: string;
  /** The ticket key, set off before the title. */
  ref: string;
  title: string;
}

const WorkGroup = (props: {
  label: string;
  items: Item[] | undefined;
  /** Whether there are more than the listed ones. */
  more: boolean;
  allTo: string;
  error?: string;
  empty: string;
}) => {
  const location = useLocation();
  let body: ReactNode;
  if (props.error) {
    body = (
      <p className="text-destructive px-2 py-1 text-xs" title={props.error}>
        Couldn&apos;t load {props.label.toLowerCase()}.
      </p>
    );
  } else if (!props.items) {
    body = <p className="text-muted-foreground px-2 py-1 text-xs">Loading…</p>;
  } else if (props.items.length === 0) {
    body = (
      <p className="text-muted-foreground px-2 py-1 text-xs">{props.empty}</p>
    );
  }
  return (
    <SidebarGroup>
      <SidebarGroupLabel asChild>
        <Link to={props.allTo} className="hover:text-sidebar-foreground">
          {props.label}
        </Link>
      </SidebarGroupLabel>
      <SidebarMenu>
        {props.items?.map((item) => (
          <SidebarMenuItem key={item.key}>
            <SidebarMenuButton
              asChild
              isActive={location.pathname === item.to}
              title={`${item.ref} ${item.title}`}
            >
              <Link to={item.to}>
                <span className="text-muted-foreground shrink-0 font-mono text-xs">
                  {item.ref}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
        {body}
        {props.more && (
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="sm">
              <Link to={props.allTo}>
                <span className="text-muted-foreground text-xs">Show all</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
};

const ProjectTickets = ({ links }: { links: ProjectLinks }) => {
  const query = projectTicketsQuery(links);
  const tickets = useJiraQuery(
    ["sidebar", "tickets", links.jiraBoard?.id, links.jiraJql],
    (signal) => fetchJiraTickets(query, signal)
  );
  const items = tickets.data?.tickets.slice(0, SHOWN).map((t) => ({
    key: t.key,
    ref: t.key,
    title: t.title,
    to: `/jira/${encodeURIComponent(t.key)}`,
  }));
  return (
    <WorkGroup
      label="Tickets"
      items={items}
      more={(tickets.data?.total ?? 0) > SHOWN}
      allTo={projectTicketsHref(links)}
      error={tickets.error?.message}
      empty={
        links.jiraBoard
          ? `No open tickets on ${links.jiraBoard.name}.`
          : "No open tickets."
      }
    />
  );
};

/** The open tickets of the Jira board or JQL the project is linked to. */
export const LinkedWork = ({ view }: { view: ProjectView }) => {
  const { jira } = useDash();
  const links = useProjectLinks(view.project.id).data;
  const tickets =
    jira?.enabled && (links?.jiraBoard || links?.jiraJql) ? links : undefined;
  return tickets ? <ProjectTickets links={tickets} /> : null;
};
