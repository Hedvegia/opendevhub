import { normalizeJql, validJql } from "../../shared/jira";
import type { Project, ProjectLinks } from "../../shared/types";
import type { ProjectSettingsStore } from "../config";
import type { DashboardDeps } from "../dashboard-api";
import { NotFoundError } from "../errors";

export interface ProjectLinksDeps {
  project: (id: string) => Project | undefined;
  settings: ProjectSettingsStore;
}

const REPOSITORY = /^[\w.-]+\/[\w.-]+$/u;

/** Reads the links from a project's `config.json` entry, dropping any that were hand-edited into a bad shape. */
export const readProjectLinks = (
  entry: Record<string, unknown>
): ProjectLinks => {
  const { jiraBoard, jiraJql, forgejoRepository } = entry as {
    jiraBoard?: { id?: unknown; name?: unknown };
    jiraJql?: unknown;
    forgejoRepository?: unknown;
  };
  const board =
    jiraBoard &&
    Number.isSafeInteger(jiraBoard.id) &&
    (jiraBoard.id as number) > 0 &&
    typeof jiraBoard.name === "string"
      ? { id: jiraBoard.id as number, name: jiraBoard.name }
      : undefined;
  const jql = typeof jiraJql === "string" ? normalizeJql(jiraJql) : "";
  const repository =
    typeof forgejoRepository === "string" && REPOSITORY.test(forgejoRepository)
      ? forgejoRepository
      : undefined;
  return {
    ...(board ? { jiraBoard: board } : {}),
    ...(jql && validJql(jql) ? { jiraJql: jql } : {}),
    ...(repository ? { forgejoRepository: repository } : {}),
  };
};

/** The Jira board and Forgejo repository a project is linked to, kept in its `config.json` entry. */
export const projectLinkSettings = (
  deps: ProjectLinksDeps
): { projectLinks: NonNullable<DashboardDeps["projectLinks"]> } => {
  const pathOf = (id: string): string => {
    const project = deps.project(id);
    if (!project) {
      throw new NotFoundError(id);
    }
    return project.path;
  };
  return {
    projectLinks: {
      get: (id) => readProjectLinks(deps.settings.get(pathOf(id))),
      // Saving replaces every link, so a link left out is removed.
      save: (id, links) =>
        deps.settings.update(pathOf(id), {
          forgejoRepository: links.forgejoRepository,
          jiraBoard: links.jiraBoard
            ? { id: links.jiraBoard.id, name: links.jiraBoard.name }
            : undefined,
          jiraJql: links.jiraJql ? normalizeJql(links.jiraJql) : undefined,
        }),
    },
  };
};
