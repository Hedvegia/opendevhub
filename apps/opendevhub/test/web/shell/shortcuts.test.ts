import { describe, expect, it } from "vitest";

import {
  bindingOf,
  conflictFor,
  parseOverrides,
  withBinding,
} from "../../../src/web/shell/shortcuts";

describe(parseOverrides, () => {
  it("keeps known shortcuts with a key or null and drops the rest", () => {
    expect(
      parseOverrides(
        JSON.stringify({
          chatSend: "Mod+Enter",
          gone: "X",
          palette: null,
          sidebar: 3,
        })
      )
    ).toStrictEqual({ chatSend: "Mod+Enter", palette: null });
  });

  it("reads nothing from missing or broken storage", () => {
    expect(parseOverrides(null)).toStrictEqual({});
    expect(parseOverrides("{nope")).toStrictEqual({});
    expect(parseOverrides("[1]")).toStrictEqual({});
  });
});

describe(withBinding, () => {
  it("stores a changed key and drops it again when set back to the default", () => {
    const changed = withBinding({}, "palette", "Mod+P");
    expect(changed).toStrictEqual({ palette: "Mod+P" });
    expect(bindingOf("palette", changed)).toBe("Mod+P");
    expect(withBinding(changed, "palette", "Mod+K")).toStrictEqual({});
  });

  it("remembers a shortcut that was turned off", () => {
    const off = withBinding({}, "newTask", null);
    expect(off).toStrictEqual({ newTask: null });
    expect(bindingOf("newTask", off)).toBeNull();
  });
});

describe(conflictFor, () => {
  it("flags a key taken in the same scope or by a global shortcut", () => {
    expect(conflictFor("cardAlways", "R", {})).toBe("Reject");
    expect(conflictFor("chatNewline", "Enter", {})).toBe("Send");
    expect(conflictFor("cardAlways", "N", {})).toBe("New task");
    expect(conflictFor("newTask", "J", {})).toBe("Next card");
  });

  it("allows the same key in scopes that never overlap", () => {
    expect(conflictFor("reviewNext", "J", {})).toBeUndefined();
    expect(conflictFor("newTaskStart", "Enter", {})).toBeUndefined();
  });

  it("frees a key once its shortcut is rebound or turned off", () => {
    expect(
      conflictFor("chatNewline", "Enter", { chatSend: "Mod+Enter" })
    ).toBeUndefined();
    expect(
      conflictFor("cardAlways", "R", { cardReject: null })
    ).toBeUndefined();
  });
});
