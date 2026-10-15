import { describe, expect, it } from "vitest";

import {
  ARM_DELAY_MS,
  CARD_SHORTCUTS,
  cardKeyCounts,
  canTakeFocus,
} from "../../../../src/web/features/sessions/card-keys";
import { defaultBinding } from "../../../../src/web/shell/shortcuts";

const key = (over: Partial<Parameters<typeof cardKeyCounts>[0]> = {}) => ({
  onCard: true,
  repeat: false,
  ...over,
});

describe(cardKeyCounts, () => {
  it("counts a key on the card once it is armed", () => {
    expect(cardKeyCounts(key(), 0, ARM_DELAY_MS)).toBeTruthy();
  });

  it("ignores a second press that lands on a card that just appeared", () => {
    expect(cardKeyCounts(key(), 1000, 1000 + ARM_DELAY_MS - 1)).toBeFalsy();
    expect(cardKeyCounts(key(), 1000, 1100)).toBeFalsy();
  });

  it("ignores auto-repeat and keys pressed in the card's fields", () => {
    expect(cardKeyCounts(key({ repeat: true }), 0, ARM_DELAY_MS)).toBeFalsy();
    expect(cardKeyCounts(key({ onCard: false }), 0, ARM_DELAY_MS)).toBeFalsy();
  });

  it("binds the card's actions to Enter, a, r, j and k by default", () => {
    expect(
      Object.values(CARD_SHORTCUTS).map((id) => defaultBinding(id))
    ).toStrictEqual(["A", "J", "Enter", "K", "R"]);
  });
});

describe(canTakeFocus, () => {
  const body = { id: "body" };
  const inside = { id: "inside" };
  const elsewhere = { id: "elsewhere" };
  const stack = { contains: (n: unknown) => n === inside };

  it("only takes focus from nowhere or from its own stack", () => {
    expect(canTakeFocus(body, body, stack)).toBeTruthy();
    expect(canTakeFocus(null, body, stack)).toBeTruthy();
    expect(canTakeFocus(inside, body, stack)).toBeTruthy();
    expect(canTakeFocus(elsewhere, body, stack)).toBeFalsy();
    expect(canTakeFocus(body, body, null)).toBeTruthy();
  });
});
