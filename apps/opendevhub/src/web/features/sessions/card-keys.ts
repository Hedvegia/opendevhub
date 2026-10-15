import type { ShortcutId } from "../../shell/shortcuts";

/**
 * A card ignores its shortcut keys for this long after it appears, so a second Enter (a double press or
 * key repeat) meant for the card just answered can't approve the next one before the user has seen it.
 */
export const ARM_DELAY_MS = 400;

export type CardAction = "once" | "always" | "reject" | "next" | "prev";

/** Each card action's rebindable shortcut. */
export const CARD_SHORTCUTS = {
  always: "cardAlways",
  next: "cardNext",
  once: "cardOnce",
  prev: "cardPrev",
  reject: "cardReject",
} as const satisfies Record<CardAction, ShortcutId>;

export interface CardKey {
  repeat: boolean;
  /** The card itself has focus, not one of its fields or buttons. */
  onCard: boolean;
}

/** Whether a shortcut pressed on a pending card counts. */
export const cardKeyCounts = (
  k: CardKey,
  mountedAt: number,
  now: number
): boolean => k.onCard && !k.repeat && now - mountedAt >= ARM_DELAY_MS;

/** A card that appears after the previous one was answered may only take focus from nowhere or from its own stack. */
export const canTakeFocus = <T>(
  active: T | null,
  body: T,
  stack: { contains: (node: T) => boolean } | null
): boolean =>
  active === null || active === body || (stack?.contains(active) ?? false);
