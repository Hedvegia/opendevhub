import type { ForgejoPullRequest } from "../../../shared/forgejo";

const STALE_PULL_MS = 2 * 24 * 60 * 60 * 1000;

/** Open pull requests become stale after 48 hours without activity in Forgejo. */
export const isStalePull = (
  pull: Pick<ForgejoPullRequest, "state" | "updatedAt">,
  now: number
): boolean =>
  pull.state === "open" && now - Date.parse(pull.updatedAt) >= STALE_PULL_MS;
