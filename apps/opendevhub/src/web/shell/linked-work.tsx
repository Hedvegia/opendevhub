import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import type { ProjectView } from "../../shared/types";
import { fetchForgejoPulls, fetchJiraTickets } from "../api";
import { useDash } from "../dashboard-context";
import { useForgejoQuery } from "../features/forgejo/use-forgejo";
import { useJiraQuery } from "../features/jira/use-jira";
import { useProjectLinks } from "../features/projects/links-settings";
import { Link } from "../routing";

/** How many open tickets and pull requests the sidebar lists before "Show all". */
const SHOWN = 5;

interface Item {
  key: string;
  to: string;
  /** The ticket key or pull request number, set off before the title. */
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

const BoardTickets = ({ board }: { board: { id: number; name: string } }) => {
  const query = { board: board.id, scope: "board", status: "open" } as const;
  const tickets = useJiraQuery(["sidebar", "board", board.id], (signal) =>
    fetchJiraTickets(query, signal)
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
      allTo={`/jira?scope=board&board=${board.id}&status=open`}
      error={tickets.error?.message}
      empty={`No open tickets on ${board.name}.`}
    />
  );
};

const RepositoryPulls = ({ repository }: { repository: string }) => {
  const pulls = useForgejoQuery(["sidebar", "pulls", repository], (signal) =>
    fetchForgejoPulls({ inbox: "review", repository, state: "open" }, signal)
  );
  const list = pulls.data?.pulls;
  const items = list?.slice(0, SHOWN).map((p) => ({
    key: `${p.owner}/${p.repo}#${p.number}`,
    ref: `#${p.number}`,
    title: p.title,
    to: `/forgejo/${encodeURIComponent(p.owner)}/${encodeURIComponent(p.repo)}/${p.number}`,
  }));
  return (
    <WorkGroup
      label="Pull requests"
      items={items}
      more={(list?.length ?? 0) > SHOWN || pulls.data?.nextPage !== undefined}
      allTo={`/forgejo?${new URLSearchParams({ inbox: "review", repository, state: "open" })}`}
      error={pulls.error?.message}
      empty="No open pull requests."
    />
  );
};

/** The open tickets and pull requests of the Jira board and Forgejo repository the project is linked to. */
export const LinkedWork = ({ view }: { view: ProjectView }) => {
  const { jira, forgejo } = useDash();
  const links = useProjectLinks(view.project.id).data;
  const board = jira?.enabled ? links?.jiraBoard : undefined;
  const repository = forgejo?.enabled ? links?.forgejoRepository : undefined;
  return (
    <>
      {board && <BoardTickets board={board} />}
      {repository && <RepositoryPulls repository={repository} />}
    </>
  );
};
