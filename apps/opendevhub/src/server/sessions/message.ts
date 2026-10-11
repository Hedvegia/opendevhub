import { HUB_COMMANDS } from "../../shared/types";
import type { ComposerSendRequest, HubCommandName } from "../../shared/types";
import { InvalidRequestError } from "../git/worktrees";
import { toAttachments } from "../opencode/client";
import type { PromptAttachments, RawCommand } from "../opencode/client";

/** `/name` at the very start of a message, then whitespace or the end; `/etc/hosts` isn't one. */
const SLASH_COMMAND = /^\/(?<name>[^\s/]+)(?:\s+|$)/u;

/** The message's `/name`, if it starts with one, and where its arguments begin. */
export const slashOf = (text: string): { name?: string; offset: number } => {
  const slash = SLASH_COMMAND.exec(text);
  const name = slash?.groups?.name;
  return name ? { name, offset: slash[0].length } : { offset: 0 };
};

/** The hub command a message asks for (`/new`, `/interrupt`), which opencode never sees. */
export const hubCommandOf = (text: string): HubCommandName | undefined => {
  const { name } = slashOf(text);
  return HUB_COMMANDS.find((c) => c.name === name)?.name;
};

/** The message's mentions from `offset` on as opencode's attachments; a bad mention is the request's fault. */
export const attachmentsOf = (
  directory: string,
  request: ComposerSendRequest,
  offset = 0
): PromptAttachments => {
  try {
    return toAttachments(
      directory,
      request.text,
      request.mentions ?? [],
      offset
    );
  } catch (error) {
    throw new InvalidRequestError(
      error instanceof Error ? error.message : String(error)
    );
  }
};

/** What opencode is sent for a composer message: a command with its arguments, or a prompt. */
export interface ResolvedMessage {
  /** Set when the message runs one of the checkout's commands; `text` is then its arguments. */
  command?: string;
  text: string;
  attachments: PromptAttachments;
}

/**
 * A composer message for opencode in `directory`, leaving hub commands to the caller: `/name` of a command the
 * checkout has (asked of `commands` only when the message starts with `/name`) runs it with the rest as arguments;
 * anything else, unknown `/name` included, is a prompt. Mentions go along as attachments either way.
 */
export const resolveMessage = async (
  commands: () => Promise<RawCommand[]>,
  directory: string,
  request: ComposerSendRequest
): Promise<ResolvedMessage> => {
  const { text } = request;
  const { name, offset } = slashOf(text);
  const known = name ? await commands() : [];
  if (name && known.some((c) => c.name === name)) {
    return {
      attachments: attachmentsOf(directory, request, offset),
      command: name,
      text: text.slice(offset),
    };
  }
  return { attachments: attachmentsOf(directory, request), text };
};
