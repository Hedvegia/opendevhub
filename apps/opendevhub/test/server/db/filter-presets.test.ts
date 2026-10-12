import { describe, expect, it } from "vitest";

import { openDatabase } from "../../../src/server/db/database";
import {
  ForgejoPresetStore,
  JiraPresetStore,
} from "../../../src/server/db/filter-presets";
import { ConflictError, NotFoundError } from "../../../src/server/errors";
import type { ForgejoPresetFilters } from "../../../src/shared/forgejo";
import type { JiraPresetFilters } from "../../../src/shared/jira";

const mine: ForgejoPresetFilters = { inbox: "authored", state: "open" };
const team: ForgejoPresetFilters = {
  authors: ["alex", "sam"],
  inbox: "review",
  org: "acme",
  state: "all",
  team: "backend",
};

const setup = () => new ForgejoPresetStore(openDatabase(":memory:"));

describe("ForgejoPresetStore", () => {
  it("lists created presets by name, case-insensitively", () => {
    const presets = setup();
    presets.create("team", team);
    presets.create("Mine", mine);
    expect(presets.list()).toStrictEqual([
      { filters: mine, id: 2, name: "Mine" },
      { filters: team, id: 1, name: "team" },
    ]);
  });

  it("refuses a name another preset has, whatever its case", () => {
    const presets = setup();
    presets.create("Mine", mine);
    expect(() => presets.create("mine", team)).toThrow(ConflictError);
    const other = presets.create("Team", team);
    expect(() => presets.update(other.id, { name: "MINE" })).toThrow(
      ConflictError
    );
  });

  it("renames a preset and replaces its filters", () => {
    const presets = setup();
    const { id } = presets.create("Mine", mine);
    expect(presets.update(id, { name: "Backend" })).toStrictEqual({
      filters: mine,
      id,
      name: "Backend",
    });
    expect(presets.update(id, { filters: team })).toStrictEqual({
      filters: team,
      id,
      name: "Backend",
    });
  });

  it("removes a preset, and throws for an unknown one", () => {
    const presets = setup();
    const { id } = presets.create("Mine", mine);
    presets.remove(id);
    expect(presets.list()).toStrictEqual([]);
    expect(() => presets.remove(id)).toThrow(NotFoundError);
    expect(() => presets.update(id, { name: "x" })).toThrow(NotFoundError);
  });
});

describe("JiraPresetStore", () => {
  it("keeps Tickets views apart from pull request presets", () => {
    const db = openDatabase(":memory:");
    const jira = new JiraPresetStore(db);
    new ForgejoPresetStore(db).create("Mine", mine);
    const view: JiraPresetFilters = {
      jql: "labels = api",
      scope: "all",
      search: "",
      sort: "updated",
      status: "open",
    };
    jira.create("API", view);
    expect(jira.list()).toStrictEqual([{ filters: view, id: 1, name: "API" }]);
  });
});
