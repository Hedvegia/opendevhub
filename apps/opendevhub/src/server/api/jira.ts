import { Hono } from "hono";

import { parseJiraQuery } from "../../shared/jira";
import type { JiraFilterPresets, JiraTicketSummary } from "../../shared/jira";
import type { DashboardDeps } from "../dashboard-api";
import { NotFoundError, UnavailableError } from "../errors";
import { InvalidRequestError } from "../git/worktrees";
import { json, ok, param } from "./helpers";
import { bodies, queries, validateJson, validateQuery } from "./validation";

/** The instance a listed ticket lives on: its URL without `/browse/<key>`. */
const instanceOf = (t: JiraTicketSummary): string | undefined => {
  const suffix = `/browse/${encodeURIComponent(t.key)}`;
  return t.url.endsWith(suffix) ? t.url.slice(0, -suffix.length) : undefined;
};

/** A preset id from the path; an id that isn't one matches no preset. */
const presetId = (id: string): number => {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new NotFoundError(id, "filter preset");
  }
  return n;
};

export const createJiraRoutes = (deps: DashboardDeps) => {
  /** Refreshes the title and status of the tickets opendevhub knows; a failure never fails the request. */
  const refresh = (
    list: {
      instanceUrl: string;
      key: string;
      title: string;
      status: string;
      url: string;
    }[]
  ) => {
    try {
      deps.links?.refreshTickets(list);
    } catch {
      // A stale snapshot is shown with when it was fetched.
    }
  };
  const requireJira = () => {
    if (!deps.jira) {
      throw new UnavailableError("Jira is not available");
    }
    return deps.jira;
  };
  const requirePresets = () => {
    if (!deps.jiraPresets) {
      throw new UnavailableError("Filter presets are not available");
    }
    return deps.jiraPresets;
  };
  return new Hono()
    .use("/api/jira/*", async (c, next) => {
      c.header("Cache-Control", "no-store");
      await next();
    })
    .get("/api/jira/settings", (c) => json(c, () => requireJira().view()))
    .post("/api/jira/settings", validateJson(bodies.integration), (c) =>
      json(c, (_id) => {
        const b = c.req.valid("json");
        return requireJira().save(b);
      })
    )
    .get("/api/jira/tickets", validateQuery(queries.jira), (c) =>
      json(c, async () => {
        const query = parseJiraQuery(new URL(c.req.url).searchParams);
        if (!query) {
          throw new InvalidRequestError("Invalid Jira search or page.");
        }
        const result = await requireJira().tickets(query);
        refresh(
          result.tickets.flatMap((t) => {
            const instanceUrl = instanceOf(t);
            return instanceUrl ? [{ ...t, instanceUrl }] : [];
          })
        );
        return result;
      })
    )
    .get("/api/jira/presets", (c) =>
      json(c, (): JiraFilterPresets => ({ presets: requirePresets().list() }))
    )
    .post("/api/jira/presets", validateJson(bodies.jiraPreset), (c) =>
      json(c, () => {
        const b = c.req.valid("json");
        return requirePresets().create(b.name, b.filters);
      })
    )
    .put("/api/jira/presets/:id", validateJson(bodies.jiraPresetUpdate), (c) =>
      json(c, (id) =>
        requirePresets().update(presetId(id), c.req.valid("json"))
      )
    )
    .delete("/api/jira/presets/:id", (c) =>
      ok(c, (id) => requirePresets().remove(presetId(id)))
    )
    .get("/api/jira/catalog", (c) => json(c, () => requireJira().catalog()))
    .get("/api/jira/boards/:id/columns", (c) =>
      json(c, () => {
        const id = param(c, "id");
        if (!/^[1-9]\d{0,14}$/u.test(id)) {
          throw new InvalidRequestError("Invalid Jira board.");
        }
        return requireJira().columns(Number(id));
      })
    )
    .get("/api/jira/tickets/:key", (c) =>
      json(c, async () => {
        const ticket = await requireJira().ticket(param(c, "key"));
        refresh([ticket]);
        return ticket;
      })
    );
};
