import { describe, expect, it } from "vitest";

import {
  deleteMentionBefore,
  insertCommand,
  insertMention,
  rebase,
  triggerAt,
} from "../../../../src/web/features/sessions/composer-text";
import type { ComposerValue } from "../../../../src/web/features/sessions/composer-text";

const plain = (text: string): ComposerValue => ({ mentions: [], text });

describe(triggerAt, () => {
  it("suggests commands only for a / that starts the message, until the first space", () => {
    expect(triggerAt(plain("/ops"), 4)).toStrictEqual({
      kind: "command",
      query: "ops",
      start: 0,
    });
    expect(triggerAt(plain("/"), 1)).toMatchObject({ query: "" });
    expect(triggerAt(plain("/ops args"), 9)).toBeUndefined();
    expect(triggerAt(plain("see /ops"), 8)).toBeUndefined();
  });

  it("suggests mentions for an @ at the start or after whitespace, not inside a word or a token", () => {
    expect(triggerAt(plain("@log"), 4)).toStrictEqual({
      kind: "mention",
      query: "log",
      start: 0,
    });
    expect(triggerAt(plain("explain @src/a"), 14)).toMatchObject({
      query: "src/a",
      start: 8,
    });
    expect(triggerAt(plain("tim@example.com"), 15)).toBeUndefined();
    expect(triggerAt(plain("@a b"), 4)).toBeUndefined();
    const token: ComposerValue = {
      mentions: [{ end: 5, kind: "file", name: "a.ts", start: 0 }],
      text: "@a.ts",
    };
    expect(triggerAt(token, 5)).toBeUndefined();
  });
});

describe(insertCommand, () => {
  it("replaces the typed name with the chosen command and a space", () => {
    expect(insertCommand(plain("/ops"), 4, "opsx-propose")).toStrictEqual({
      caret: 14,
      value: plain("/opsx-propose "),
    });
    expect(
      insertCommand(plain("/op dark mode"), 3, "opsx-propose").value.text
    ).toBe("/opsx-propose dark mode");
  });
});

describe(insertMention, () => {
  it("inserts the token with a space and records its range", () => {
    const value = plain("explain @log please");
    const trigger = triggerAt(value, 12)!;
    const out = insertMention(value, trigger, 12, {
      kind: "file",
      name: "src/auth/login.ts",
    });
    expect(out.value.text).toBe("explain @src/auth/login.ts please");
    expect(out.value.mentions).toStrictEqual([
      { end: 26, kind: "file", name: "src/auth/login.ts", start: 8 },
    ]);
    expect(out.caret).toBe(27);
  });
});

describe(rebase, () => {
  const value: ComposerValue = {
    mentions: [
      { end: 7, kind: "agent", name: "explore", start: 0 },
      { end: 15, kind: "file", name: "a.ts", start: 10 },
    ],
    text: "@explore, @a.ts done",
  };
  // "@explore" is 8 characters; the first range is deliberately wrong to show it gets dropped.
  const fixed: ComposerValue = {
    ...value,
    mentions: [{ ...value.mentions[0], end: 8 }, value.mentions[1]],
  };

  it("shifts tokens after an edit and keeps those before it", () => {
    const out = rebase(fixed, "@explore, see @a.ts done");
    expect(out.mentions.map((m) => [m.start, m.end])).toStrictEqual([
      [0, 8],
      [14, 19],
    ]);
  });

  it("drops a token the edit touched, and one that no longer matches", () => {
    expect(rebase(fixed, "@explore, @b.ts done").mentions).toHaveLength(1);
    expect(rebase(value, value.text).mentions).toHaveLength(1);
  });
});

describe(deleteMentionBefore, () => {
  it("removes the whole token when the caret sits right after it", () => {
    const value: ComposerValue = {
      mentions: [{ end: 9, kind: "file", name: "src/a.ts", start: 0 }],
      text: "@src/a.ts and",
    };
    expect(deleteMentionBefore(value, 9)).toStrictEqual({
      caret: 0,
      value: plain(" and"),
    });
    expect(deleteMentionBefore(value, 10)).toBeUndefined();
  });
});
