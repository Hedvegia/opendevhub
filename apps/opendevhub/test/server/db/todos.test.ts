import { describe, expect, it } from "vitest";

import { TodoStore } from "../../../src/server/db/todos";
import { NotFoundError } from "../../../src/server/errors";
import type { Project } from "../../../src/shared/types";
import { memoryStores } from "../../helpers/stores";

const project = (id: string): Project => ({
  devcontainerPath: `/src/${id}/.devcontainer/devcontainer.json`,
  id,
  name: id,
  path: `/src/${id}`,
});

const setup = () => {
  const clock = { now: 1000 };
  const s = memoryStores(() => clock.now);
  s.projects.upsertAll([project("demo"), project("other")]);
  return { clock, todos: new TodoStore(s.db, () => clock.now) };
};

describe("TodoStore", () => {
  it("lists a project's items in the order they were added", () => {
    const { todos } = setup();
    todos.add("demo", "Write docs");
    todos.add("other", "Elsewhere");
    todos.add("demo", "Ship it");
    expect(todos.list("demo")).toStrictEqual([
      { createdAt: 1000, done: false, id: 1, text: "Write docs" },
      { createdAt: 1000, done: false, id: 3, text: "Ship it" },
    ]);
  });

  it("refuses an item for an unknown project", () => {
    const { todos } = setup();
    expect(() => todos.add("nope", "Anything")).toThrow(NotFoundError);
  });

  it("checks an item off, reopens it and rewords it", () => {
    const { todos } = setup();
    const { id } = todos.add("demo", "Write docs");
    expect(todos.update("demo", id, { done: true }).done).toBe(true);
    expect(todos.update("demo", id, { text: "Write the docs" })).toMatchObject({
      done: true,
      text: "Write the docs",
    });
    expect(todos.update("demo", id, { done: false }).done).toBe(false);
  });

  it("only touches items on the named project's list", () => {
    const { todos } = setup();
    const { id } = todos.add("demo", "Write docs");
    expect(() => todos.update("other", id, { done: true })).toThrow(
      NotFoundError
    );
    expect(() => todos.remove("other", id)).toThrow(NotFoundError);
    todos.remove("demo", id);
    expect(todos.list("demo")).toStrictEqual([]);
    expect(() => todos.remove("demo", id)).toThrow(NotFoundError);
  });
});
