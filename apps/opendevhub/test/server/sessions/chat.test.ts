import { describe, expect, it, vi } from "vitest";

import { InvalidRequestError } from "../../../src/server/git/worktrees";
import { project, setup } from "../../helpers/hub";

describe("chat", () => {
  const ws = "/workspaces/demo";
  async function started() {
    const s = setup();
    await s.hub.environments.rescan();
    await s.hub.environments.start(project.id);
    s.client.commands.mockResolvedValue([{ name: "opsx-propose" }]);
    return s;
  }

  it("starts a task in a new worktree, titled from the message, whose first turn is the message", async () => {
    const s = await started();
    const { task, sessionId } = await s.hub.chat.start(project.id, {
      target: { kind: "worktree" },
      message: { text: "add a dark mode toggle" },
    });
    expect(sessionId).toBeUndefined();
    expect(s.tasks.get(task)).toMatchObject({
      kind: "task",
      title: "add a dark mode toggle",
    });
    await vi.waitFor(() => expect(s.client.prompt).toHaveBeenCalledOnce());
    const [, text, , directory] = s.client.prompt.mock.calls[0];
    expect(text).toBe("add a dark mode toggle");
    expect(directory).not.toBe(ws);
  });

  it("starts a conversation in a checkout, runs the message's command there, and answers with its manual task", async () => {
    const s = await started();
    const { task, sessionId } = await s.hub.chat.start(project.id, {
      target: { kind: "checkout", directory: ws },
      message: { text: "/opsx-propose add dark mode" },
    });
    expect(sessionId).toBe("ses_new");
    expect(s.tasks.get(task)).toMatchObject({ kind: "manual" });
    expect(s.client.command).toHaveBeenCalledWith(
      "ses_new",
      "opsx-propose",
      "add dark mode",
      ws,
      {}
    );
  });

  it("starts on the chosen model with the attached files, in a checkout and in a new worktree", async () => {
    const s = await started();
    const model = { id: "gpt-5", providerID: "openai" };
    const attachments = [
      { name: "shot.png", url: "data:image/png;base64,aGk=" },
    ];
    await s.hub.chat.start(project.id, {
      target: { kind: "checkout", directory: ws },
      message: { text: "what's wrong here", attachments, model },
    });
    expect(s.client.createSession).toHaveBeenCalledWith(ws, {
      title: undefined,
      model,
    });
    expect(s.client.prompt).toHaveBeenCalledWith(
      "ses_new",
      "what's wrong here",
      undefined,
      ws,
      { files: [{ name: "shot.png", uri: attachments[0].url }] }
    );
    s.client.createSession.mockClear();
    s.client.prompt.mockClear();
    await s.hub.chat.start(project.id, {
      target: { kind: "worktree" },
      message: { text: "fix the layout", attachments, model },
    });
    await vi.waitFor(() => expect(s.client.prompt).toHaveBeenCalledOnce());
    expect(s.client.createSession.mock.calls[0][1]).toMatchObject({ model });
    expect(s.client.prompt.mock.calls[0][4]).toStrictEqual({
      files: [{ name: "shot.png", uri: attachments[0].url }],
    });
  });

  it("refuses a directory outside the project and the hub's commands, starting nothing", async () => {
    const s = await started();
    await expect(
      s.hub.chat.start(project.id, {
        target: { kind: "checkout", directory: "/etc" },
        message: { text: "hi" },
      })
    ).rejects.toThrow(InvalidRequestError);
    for (const target of [
      { kind: "worktree" as const },
      { kind: "checkout" as const, directory: ws },
    ]) {
      await expect(
        s.hub.chat.start(project.id, { target, message: { text: "/new hi" } })
      ).rejects.toThrow(InvalidRequestError);
    }
    expect(s.client.createSession).not.toHaveBeenCalled();
    expect(s.tasks.listForProject(project.id)).toStrictEqual([]);
  });

  it("refuses a bad mention before creating a conversation", async () => {
    const s = await started();
    await expect(
      s.hub.chat.start(project.id, {
        target: { kind: "checkout", directory: ws },
        message: {
          text: "@../secret",
          mentions: [{ kind: "file", start: 0, end: 10, name: "../secret" }],
        },
      })
    ).rejects.toThrow(InvalidRequestError);
    expect(s.client.createSession).not.toHaveBeenCalled();
  });
});
