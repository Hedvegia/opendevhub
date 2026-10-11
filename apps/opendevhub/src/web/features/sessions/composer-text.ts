import type { ComposerMention } from "../../../shared/types";

/** What the caret is typing: a `/command` at the start of the message, or an `@mention`. */
export type Trigger =
  | { kind: "command"; start: number; query: string }
  | { kind: "mention"; start: number; query: string };

/** The message and the `@` tokens in it; each token is `text.slice(start, end) === "@" + name`. */
export interface ComposerValue {
  text: string;
  mentions: ComposerMention[];
}

const WHITESPACE = /\s/u;

const inMention = (mentions: readonly ComposerMention[], at: number) =>
  mentions.some((m) => at > m.start && at <= m.end);

/**
 * The suggestion list the caret asks for, if any. `/` counts only as the message's first character, up to the
 * first whitespace; `@` only at the start or after whitespace (so `tim@example.com` isn't one), outside a token.
 */
export const triggerAt = (
  value: ComposerValue,
  caret: number
): Trigger | undefined => {
  const { text } = value;
  const before = text.slice(0, caret);
  if (text.startsWith("/") && !WHITESPACE.test(before)) {
    return { kind: "command", query: before.slice(1), start: 0 };
  }
  let at = caret - 1;
  while (at >= 0 && !WHITESPACE.test(text[at]) && text[at] !== "@") {
    at -= 1;
  }
  if (at < 0 || text[at] !== "@") {
    return undefined;
  }
  if (at > 0 && !WHITESPACE.test(text[at - 1])) {
    return undefined;
  }
  if (inMention(value.mentions, at + 1)) {
    return undefined;
  }
  return { kind: "mention", query: text.slice(at + 1, caret), start: at };
};

/** Replaces the typed `/query` with `/name ` and puts the caret after it. */
export const insertCommand = (
  value: ComposerValue,
  caret: number,
  name: string
): { value: ComposerValue; caret: number } => {
  const inserted = `/${name} `;
  const rest = value.text.slice(caret).replace(/^\S*\s?/u, "");
  return {
    caret: inserted.length,
    value: rebase(value, `${inserted}${rest}`),
  };
};

/** Replaces the typed `@query` with the `@name` token (and a space) and records it. */
export const insertMention = (
  value: ComposerValue,
  trigger: Trigger,
  caret: number,
  mention: Pick<ComposerMention, "kind" | "name">
): { value: ComposerValue; caret: number } => {
  const token = `@${mention.name}`;
  const after = value.text.slice(caret);
  const space = after.startsWith(" ") ? "" : " ";
  const text = `${value.text.slice(0, trigger.start)}${token}${space}${after}`;
  const kept = rebase(value, text);
  const added: ComposerMention = {
    ...mention,
    end: trigger.start + token.length,
    start: trigger.start,
  };
  return {
    caret: trigger.start + token.length + 1,
    value: {
      mentions: [...kept.mentions, added].toSorted((a, b) => a.start - b.start),
      text,
    },
  };
};

/**
 * Carries the tokens over to `next`, the text after an edit: the edit is the span between the longest common
 * prefix and suffix. Tokens before it stay, tokens after it shift, and a token the edit touched is dropped.
 */
export const rebase = (value: ComposerValue, next: string): ComposerValue => {
  const prev = value.text;
  let prefix = 0;
  const max = Math.min(prev.length, next.length);
  while (prefix < max && prev[prefix] === next[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < max - prefix &&
    prev[prev.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const editEnd = prev.length - suffix;
  const delta = next.length - prev.length;
  const mentions = value.mentions.flatMap((m) => {
    if (m.end <= prefix) {
      return [m];
    }
    if (m.start >= editEnd) {
      return [{ ...m, end: m.end + delta, start: m.start + delta }];
    }
    return [];
  });
  return {
    mentions: mentions.filter(
      (m) => next.slice(m.start, m.end) === `@${m.name}`
    ),
    text: next,
  };
};

/** Backspace right after a token removes the whole token; undefined when the caret isn't there. */
export const deleteMentionBefore = (
  value: ComposerValue,
  caret: number
): { value: ComposerValue; caret: number } | undefined => {
  const hit = value.mentions.find((m) => m.end === caret);
  if (!hit) {
    return undefined;
  }
  const text = value.text.slice(0, hit.start) + value.text.slice(hit.end);
  return { caret: hit.start, value: rebase(value, text) };
};
