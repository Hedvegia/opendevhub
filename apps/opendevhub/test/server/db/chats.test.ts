import { describe, expect, it, vi } from "vitest";

import type { NewChat } from "../../../src/server/db/chats";
import { USER, eventsSince } from "../../../src/server/db/events";
import { RESTART_ERROR } from "../../../src/server/db/tasks";
import type { Project } from "../../../src/shared/types";
import { memoryStores, taskEnvironment } from "../../helpers/stores";

const project: Project = {
  devcontainerPath: "/src/demo/.devcontainer/devcontainer.json",
  id: "demo-abc123",
  name: "demo",
  path: "/src/demo",
};

const setup = () => {
  const clock = { now: 1000 };
  const s = memoryStores(() => clock.now);
  s.projects.upsertAll([project]);
  const since = { id: 0 };
  /** The events written since the last call, as `<verb> <object> <actor>`. */
  const events = () => {
    const list = eventsSince(s.db, since.id);
    since.id = list.at(-1)?.id ?? since.id;
    return list.map((e) => `${e.verb} ${e.object.id} ${e.actor.type}`);
  };
  events();
  const chat = (over: Partial<NewChat> = {}): NewChat => ({
    createdAt: clock.now,
    directory: "/workspaces/demo",
    envId: project.id,
    origin: "hub",
    projectId: project.id,
    sessionId: "ses_1",
    step: "session",
    title: "Untitled session",
    ...over,
  });
  return { ...s, chat, clock, events };
};

describe("ChatStore", () => {
  it("records a chat once per session: started by the user, or discovered by the system", () => {
    const s = setup();
    const started = s.chats.insert(s.chat());
    expect(started.id).toMatch(/^c_/u);
    expect(s.chats.insert(s.chat()).id).toBe(started.id);
    const found = s.chats.insert(
      s.chat({ origin: "opencode", sessionId: "ses_2" })
    );
    expect(s.chats.bySession("ses_2")).toMatchObject({
      id: found.id,
      origin: "opencode",
    });
    expect(s.events()).toStrictEqual([
      `chat.started ${started.id} user`,
      `chat.discovered ${found.id} system`,
    ]);
  });

  it("records a new worktree chat's setup steps, its rows and its session", () => {
    const s = setup();
    const c = s.chats.insert(
      s.chat({ directory: undefined, sessionId: undefined, step: "queued" })
    );
    s.chats.update(c.id, { branch: "dark-mode", step: "worktree" });
    const rows = s.checkouts.recordCreated(
      project.id,
      { branch: "dark-mode", path: "/w/dark-mode" },
      { by: "manual" },
      USER
    );
    s.chats.update(c.id, {
      branchId: rows.branch.id,
      directory: "/w/dark-mode",
      worktreeId: rows.worktree.id,
    });
    taskEnvironment(s, project.id, "env-1", "/w/dark-mode");
    s.chats.attachSession(c.id, {
      directory: "/w/dark-mode",
      envId: "env-1",
      sessionId: "ses_9",
    });
    expect(s.chats.get(c.id)).toMatchObject({
      branch: "dark-mode",
      branchId: rows.branch.id,
      directory: "/w/dark-mode",
      envId: "env-1",
      sessionId: "ses_9",
      step: "session",
      worktreeId: rows.worktree.id,
    });
    expect(s.chats.byWorktree(rows.worktree.id)?.id).toBe(c.id);
    expect(s.chats.hasSession("ses_9")).toBeTruthy();
  });

  it("keeps only the starting chat when reconcile adopted its session first", () => {
    const s = setup();
    const stray = s.chats.insert(s.chat({ origin: "opencode" }));
    const c = s.chats.insert(s.chat({ sessionId: undefined, step: "session" }));
    s.chats.attachSession(c.id, {
      directory: "/workspaces/demo",
      envId: project.id,
      sessionId: "ses_1",
    });
    expect(s.chats.get(stray.id)).toBeUndefined();
    expect(s.chats.bySession("ses_1")?.id).toBe(c.id);
  });

  it("follows the session's title, quietly", () => {
    const s = setup();
    const c = s.chats.insert(s.chat());
    s.events();
    const heard = vi.fn();
    s.chats.subscribe(heard);
    s.chats.setTitle("ses_1", "Add dark mode");
    s.chats.setTitle("ses_1", "Add dark mode");
    expect(s.chats.get(c.id)?.title).toBe("Add dark mode");
    expect(heard).toHaveBeenCalledTimes(1);
    expect(s.events()).toStrictEqual([]);
  });

  it("marks sessions the listing lacks removed, once, and clears the mark when they return", () => {
    const s = setup();
    const c = s.chats.insert(s.chat());
    s.events();
    s.chats.markSessionsGone(project.id, new Set());
    s.chats.markSessionsGone(project.id, new Set());
    expect(s.chats.get(c.id)?.sessionRemoved).toBeTruthy();
    expect(s.chats.liveSessionsIn(project.id)).toStrictEqual([]);
    expect(s.chats.listForProject(project.id)).toStrictEqual([]);
    expect(s.events()).toStrictEqual([`chat.removed ${c.id} system`]);
    s.chats.markSessionsGone(project.id, new Set(["ses_1"]));
    expect(s.chats.get(c.id)?.sessionRemoved).toBeUndefined();
    expect(s.events()).toStrictEqual([]);
  });

  it("lists neither internal nor archived chats, newest first, and archives once", () => {
    const s = setup();
    const old = s.chats.insert(s.chat());
    s.clock.now = 2000;
    const recent = s.chats.insert(s.chat({ sessionId: "ses_2" }));
    s.chats.insert(s.chat({ origin: "internal", sessionId: "ses_3" }));
    const hidden = s.chats.insert(s.chat({ sessionId: "ses_4" }));
    s.events();
    expect(s.chats.archive(hidden.id)).toBeTruthy();
    expect(s.chats.archive(hidden.id)).toBeTruthy();
    expect(s.chats.archive("c_missing")).toBeFalsy();
    expect(s.events()).toStrictEqual([`chat.archived ${hidden.id} user`]);
    expect(s.chats.listForProject(project.id).map((c) => c.id)).toStrictEqual([
      recent.id,
      old.id,
    ]);
  });

  it("fails chats whose setup a restart interrupted", () => {
    const s = setup();
    const c = s.chats.insert(
      s.chat({ sessionId: undefined, step: "container" })
    );
    s.chats.insert(s.chat());
    expect(s.chats.failInterrupted()).toBe(1);
    expect(s.chats.get(c.id)).toMatchObject({
      error: RESTART_ERROR,
      step: "failed",
    });
    expect(s.chats.failInterrupted()).toBe(0);
  });
});
