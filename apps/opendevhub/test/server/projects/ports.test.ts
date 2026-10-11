import { describe, expect, it, vi } from "vitest";

import { projectPortSettings } from "../../../src/server/projects/ports";
import type { Project } from "../../../src/shared/types";

const project = { id: "p1", name: "demo", path: "/src/demo" } as Project;

function setup(entry: Record<string, unknown> = {}) {
  let saved = { ...entry };
  const settings = {
    get: vi.fn((_path: string) => saved),
    update: vi.fn((_path: string, patch: Record<string, unknown>) => {
      saved = Object.fromEntries(
        Object.entries({ ...saved, ...patch }).filter(
          ([, v]) => v !== undefined
        )
      );
    }),
  };
  const refreshPorts = vi.fn(async (_id: string) => {});
  const deps = projectPortSettings({
    project: (id) => (id === project.id ? project : undefined),
    refreshPorts,
    settings,
  });
  return { ...deps, settings, refreshPorts, entry: () => saved };
}

describe(projectPortSettings, () => {
  it("saves host ports sorted and unique, and applies them", async () => {
    const { projectHostPorts, entry, refreshPorts } = setup();
    await projectHostPorts.save(project.id, [9222, 5432, 9222]);
    expect(entry()).toStrictEqual({ hostPorts: [5432, 9222] });
    expect(projectHostPorts.get(project.id)).toStrictEqual([5432, 9222]);
    expect(refreshPorts).toHaveBeenCalledWith(project.id);
  });

  it("removes the key when the list is empty", async () => {
    const { projectHostPorts, entry } = setup({ hostPorts: [9222] });
    await projectHostPorts.save(project.id, []);
    expect(entry()).toStrictEqual({});
  });

  it("rejects a host port that is a forwarded port, and the reverse", async () => {
    const { projectHostPorts, projectPorts, settings, refreshPorts } = setup({
      forwardPorts: [3000],
      hostPorts: [9222],
    });
    await expect(
      projectHostPorts.save(project.id, [9222, 3000])
    ).rejects.toThrow("port 3000 is already a forwarded port of this project");
    await expect(projectPorts.save(project.id, [3000, 9222])).rejects.toThrow(
      "port 9222 is already a host port of this project"
    );
    expect(settings.update).not.toHaveBeenCalled();
    expect(refreshPorts).not.toHaveBeenCalled();
  });

  it("names every overlapping port", async () => {
    const { projectHostPorts } = setup({ forwardPorts: [80, 443] });
    await expect(projectHostPorts.save(project.id, [443, 80])).rejects.toThrow(
      "ports 80, 443 are already forwarded ports of this project"
    );
  });

  it("throws NotFoundError for an unknown project", () => {
    const { projectHostPorts } = setup();
    expect(() => projectHostPorts.get("nope")).toThrow("unknown project nope");
  });
});
