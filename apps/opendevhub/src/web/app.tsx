import {
  createRootRoute,
  createRoute,
  createRouter,
  Matches,
  redirect,
} from "@tanstack/react-router";
import type { AnyRoute, RouterHistory } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import type { ReactNode } from "react";

import {
  CheckoutPage,
  CheckoutRuntime,
  CheckoutTasks,
} from "./features/checkouts/checkout-page";
import {
  legacyPath,
  tasksPathFromSessions,
} from "./features/checkouts/checkouts";
import { CleanupPage } from "./features/cleanup/cleanup-page";
import { ForgejoPage, ForgejoPullPage } from "./features/forgejo/forgejo-page";
import { JiraPage, JiraTicketPage } from "./features/jira/jira-page";
import { Overview } from "./features/projects/overview";
import { ProjectLayout } from "./features/projects/project-layout";
import { ProjectOverview } from "./features/projects/project-overview";
import { ProjectReview } from "./features/review/project-review";
import {
  ProjectTask,
  TaskCompare,
  TaskSpec,
} from "./features/tasks/project-task";
import {
  TaskChanges,
  TaskRuntime,
  VariantCheckout,
} from "./features/tasks/task-checkout-tabs";
import { TaskConversation } from "./features/tasks/task-conversation";
import { TasksPage } from "./features/tasks/tasks-page";
import { UsagePage } from "./features/usage/usage-page";
import { parseSearch, stringifySearch } from "./routing";
import { NotFound } from "./shell/not-found";
import { Shell } from "./shell/shell";

const CheckoutTerminal = lazy(() =>
  import("./features/checkouts/checkout-terminal").then((module) => ({
    default: module.CheckoutTerminal,
  }))
);

const LazyTerminal = () => (
  <Suspense fallback={<p>Loading terminal…</p>}>
    <CheckoutTerminal />
  </Suspense>
);

/** Pages that became a settings section, by their old path. */
const OLD_SECTION_PATHS: Record<string, string> = {
  activity: "activity",
  nodes: "remote-instances",
};

const OLD_RUNTIME_TAB = /\/(?:ports|logs)$/u;

const rootRoute = createRootRoute();

const shellRoute = createRoute({
  component: Shell,
  getParentRoute: () => rootRoute,
  id: "shell",
});

const page = (path: string, component: () => ReactNode) =>
  createRoute({ component, getParentRoute: () => shellRoute, path });

const projectRoute = createRoute({
  component: ProjectLayout,
  getParentRoute: () => shellRoute,
  path: "p/$projectId",
});

/** The tabs of one checkout; the main checkout and each worktree get their own copy. */
const checkoutTabs = (parent: AnyRoute) => {
  const tab = (path: string, component: () => ReactNode) =>
    createRoute({ component, getParentRoute: () => parent, path });
  return [
    tab("/", CheckoutTasks),
    // Sessions have no page any more: CheckoutPage sends these to the session's task.
    tab("s/$sessionId", () => null),
    tab("review", ProjectReview),
    tab("terminal", LazyTerminal),
    tab("runtime", CheckoutRuntime),
    // Ports and logs moved into the runtime tab.
    ...["ports", "logs"].map((path) =>
      createRoute({
        beforeLoad: ({ location }) => {
          throw redirect({
            href: location.pathname.replace(OLD_RUNTIME_TAB, "/runtime"),
            replace: true,
          });
        },
        getParentRoute: () => parent,
        path,
      })
    ),
  ];
};

const checkoutRoute = (path: string) => {
  const route = createRoute({
    component: CheckoutPage,
    getParentRoute: () => projectRoute,
    path,
  });
  return route.addChildren(checkoutTabs(route));
};

/** A task's page and its tabs; every tab but Compare shows the selected variant (`?v=`). */
const taskRoute = () => {
  const route = createRoute({
    component: ProjectTask,
    getParentRoute: () => projectRoute,
    path: "t/$task",
  });
  const tab = (path: string, component: () => ReactNode) =>
    createRoute({ component, getParentRoute: () => route, path });
  return route.addChildren([
    tab("/", TaskConversation),
    tab("changes", TaskChanges),
    tab("terminal", () => (
      <VariantCheckout>
        <LazyTerminal />
      </VariantCheckout>
    )),
    tab("runtime", TaskRuntime),
    tab("spec", TaskSpec),
    tab("compare", TaskCompare),
  ]);
};

/**
 * Project tabs from before worktrees came first; kept so old links still land somewhere sensible. A review of a
 * worktree a task made goes on from the worktree's page to the task's Changes tab.
 */
const legacyRoute = (path: string, tab: Parameters<typeof legacyPath>[1]) =>
  createRoute({
    beforeLoad: ({ params }) => {
      const { projectId, target } = params as {
        projectId: string;
        target?: string;
      };
      throw redirect({
        href: legacyPath(projectId, tab, target),
        replace: true,
      });
    },
    getParentRoute: () => projectRoute,
    path,
  });

const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([
    page("/", Overview),
    page("tasks", TasksPage),
    // The Sessions page became Tasks; its status filter carries over.
    createRoute({
      beforeLoad: ({ location }) => {
        const { status } = location.search as { status?: string };
        throw redirect({ href: tasksPathFromSessions(status), replace: true });
      },
      getParentRoute: () => shellRoute,
      path: "sessions",
    }),
    page("usage", UsagePage),
    page("cleanup", CleanupPage),
    // Settings opens as a dialog over the current page; these keep old links working, as does the old Activity page.
    ...["settings", "settings/$section", "nodes", "activity"].map((path) =>
      createRoute({
        beforeLoad: ({ location, params }) => {
          const section =
            OLD_SECTION_PATHS[path] ??
            (params as { section?: string }).section ??
            "general";
          throw redirect({
            href: `/?settings=${encodeURIComponent(section)}${location.hash ? `#${location.hash}` : ""}`,
            replace: true,
          });
        },
        getParentRoute: () => shellRoute,
        path,
      })
    ),
    page("jira", JiraPage),
    page("jira/$key", JiraTicketPage),
    page("forgejo", ForgejoPage),
    page("forgejo/$owner/$repo/$number", ForgejoPullPage),
    projectRoute.addChildren([
      createRoute({
        component: ProjectOverview,
        getParentRoute: () => projectRoute,
        path: "/",
      }),
      taskRoute(),
      checkoutRoute("main"),
      checkoutRoute("w/$worktree"),
      legacyRoute("worktrees", "worktrees"),
      legacyRoute("review", "review"),
      legacyRoute("review/$target", "review"),
      legacyRoute("ports", "ports"),
      legacyRoute("logs", "logs"),
    ]),
    page("$", () => <NotFound />),
  ]),
]);

export const createAppRouter = (history?: RouterHistory) =>
  createRouter({
    defaultNotFoundComponent: () => <NotFound />,
    history,
    parseSearch,
    routeTree,
    stringifySearch,
  });

/** The matched pages; render inside a `RouterContextProvider`. */
export const App = () => <Matches />;
