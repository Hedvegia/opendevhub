import { describe, expect, it } from "vitest";

import { diffForNotifications, pendingSummary } from "../../src/shared/notices";
import type {
  DashboardSnapshot,
  PendingForm,
  PendingPermission,
  SessionStatus,
  SessionSummary,
} from "../../src/shared/types";

interface S {
  status: SessionStatus;
  task?: SessionSummary["task"];
  chat?: string;
  permissions?: PendingPermission[];
  forms?: PendingForm[];
}

function snap(sessions: Record<string, S>): DashboardSnapshot {
  return {
    roots: [],
    preflight: { errors: [] },
    editors: [],
    projects: [
      {
        tasks: [],
        chats: [],
        project: {
          id: "p",
          name: "demo",
          path: "/p",
          devcontainerPath: "/p/x",
        },
        runtime: {
          projectId: "p",
          containerState: "running",
          opencode: "healthy",
        },
        openUrl: "http://p.localhost:7777/",
        environments: [],
        sessions: Object.entries(sessions).map(([id, s]): SessionSummary => ({
          id,
          projectId: "p",
          title: `T ${id}`,
          directory: "/w",
          updatedAt: 1,
          status: s.status,
          ...(s.task ? { task: s.task } : {}),
          ...(s.chat ? { chat: s.chat } : {}),
          ...(s.permissions || s.forms
            ? {
                pending: {
                  permissions: s.permissions ?? [],
                  forms: s.forms ?? [],
                },
              }
            : {}),
        })),
      },
    ],
  };
}

const perm = (
  id: string,
  sessionId = "a",
  resources = ["npm test"]
): PendingPermission => ({ id, sessionId, action: "bash", resources });
const form = (id: string, title = "Which DB?"): PendingForm => ({
  id,
  sessionId: "a",
  title,
  fields: [],
});

describe(pendingSummary, () => {
  it("says what is being asked", () => {
    expect(
      pendingSummary(snap({ a: { status: "idle" } }).projects[0].sessions[0])
    ).toBeUndefined();
    const [withPerm] = snap({
      a: {
        status: "needs-permission",
        permissions: [perm("x", "a", ["npm test", "npm run lint"])],
      },
    }).projects[0].sessions;
    expect(pendingSummary(withPerm)).toBe("wants bash: npm test (+1 more)");
    const [withForm] = snap({
      a: { status: "needs-answer", forms: [form("f")] },
    }).projects[0].sessions;
    expect(pendingSummary(withForm)).toBe("asks: Which DB?");
  });
});

describe(diffForNotifications, () => {
  it("never notifies on the first snapshot, even with items waiting", () => {
    expect(
      diffForNotifications(
        undefined,
        snap({ a: { status: "needs-permission", permissions: [perm("r1")] } })
      )
    ).toStrictEqual([]);
  });

  it("points a notice at the session's task, else its chat", () => {
    const [chat, task] = diffForNotifications(
      snap({ a: { status: "running" }, b: { status: "running" } }),
      snap({
        a: { chat: "c_1", status: "idle" },
        b: {
          status: "idle",
          task: { discarded: false, id: "tsk_1", kind: "task", n: 2 },
        },
      })
    );
    expect(chat.url).toBe("/chat/p/c_1");
    expect(task.url).toBe("/p/p/t/tsk_1?v=2");
  });

  it("notifies a new permission with Allow once / Reject data", () => {
    const notices = diffForNotifications(
      snap({ a: { status: "running" } }),
      snap({ a: { status: "needs-permission", permissions: [perm("r1")] } })
    );
    expect(notices).toStrictEqual([
      {
        tag: "perm:r1",
        title: "demo · wants bash: npm test",
        body: "T a",
        url: "/p/p?session=a",
        projectId: "p",
        sessionId: "a",
        permission: { requestId: "r1" },
      },
    ]);
  });

  it("notifies a second permission in a session that is already waiting", () => {
    const prev = snap({
      a: { status: "needs-permission", permissions: [perm("r1")] },
    });
    const next = snap({
      a: {
        status: "needs-permission",
        permissions: [
          perm("r1"),
          { ...perm("r2"), action: "edit", resources: ["src/x.ts"] },
        ],
      },
    });
    expect(
      diffForNotifications(prev, next).map((n) => [n.tag, n.title])
    ).toStrictEqual([["perm:r2", "demo · wants edit: src/x.ts"]]);
  });

  it("notifies a new question without permission data", () => {
    const notices = diffForNotifications(
      snap({ a: { status: "running" } }),
      snap({ a: { status: "needs-answer", forms: [form("f1")] } })
    );
    expect(notices).toStrictEqual([
      {
        tag: "form:f1",
        title: "demo · asks: Which DB?",
        body: "T a",
        url: "/p/p?session=a",
        projectId: "p",
        sessionId: "a",
      },
    ]);
  });

  it("notifies running -> idle as finished, and nothing for idle -> running", () => {
    expect(
      diffForNotifications(
        snap({ a: { status: "running" } }),
        snap({ a: { status: "idle" } })
      )
    ).toStrictEqual([
      {
        tag: "done:a",
        title: "demo: finished",
        body: "T a",
        url: "/p/p?session=a",
        projectId: "p",
        sessionId: "a",
      },
    ]);
    expect(
      diffForNotifications(
        snap({ a: { status: "idle" } }),
        snap({ a: { status: "running" } })
      )
    ).toStrictEqual([]);
  });

  it("says nothing when an item disappears or a new session appears idle", () => {
    const prev = snap({
      a: { status: "needs-permission", permissions: [perm("r1")] },
    });
    expect(
      diffForNotifications(
        prev,
        snap({ a: { status: "running" }, z: { status: "idle" } })
      )
    ).toStrictEqual([]);
  });

  it("points a subagent's permission at its root session", () => {
    const next = snap({
      root: { status: "needs-permission", permissions: [perm("r9", "child")] },
    });
    const [notice] = diffForNotifications(
      snap({ root: { status: "running" } }),
      next
    );
    expect(notice).toMatchObject({
      sessionId: "root",
      url: "/p/p?session=root",
      permission: { requestId: "r9" },
    });
  });

  it("opens the session's task on its Conversation tab with its variant", () => {
    const task = { discarded: false, id: "abc", kind: "task" as const, n: 2 };
    const [notice] = diffForNotifications(
      snap({ a: { status: "running", task } }),
      snap({ a: { status: "idle", task } })
    );
    expect(notice).toMatchObject({ url: "/p/p/t/abc?v=2" });
  });
});
