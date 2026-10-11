import { describe, expect, it } from "vitest";

import { sessionUrl, taskHref } from "../../src/shared/urls";

describe(sessionUrl, () => {
  it("builds opencode's per-session route for the project origin", () => {
    const base = "http://demo-abc123.localhost:7777/";
    const key = Buffer.from("http://demo-abc123.localhost:7777").toString(
      "base64url"
    );
    expect(sessionUrl(base, "ses_1")).toBe(
      `http://demo-abc123.localhost:7777/server/${key}/session/ses_1`
    );
  });
});

describe(taskHref, () => {
  it("is the Conversation tab without options", () => {
    expect(taskHref("app", "abc")).toBe("/p/app/t/abc");
    expect(taskHref("app", "abc", { tab: "conversation" })).toBe(
      "/p/app/t/abc"
    );
  });

  it("adds the tab, variant and thread", () => {
    expect(taskHref("app", "abc", { tab: "changes", v: 2 })).toBe(
      "/p/app/t/abc/changes?v=2"
    );
    expect(taskHref("app", "abc", { thread: "ses_9", v: 1 })).toBe(
      "/p/app/t/abc?v=1&thread=ses_9"
    );
  });

  it("encodes ids", () => {
    expect(taskHref("my app", "a/b")).toBe("/p/my%20app/t/a%2Fb");
  });
});
