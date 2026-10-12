import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENTS_MAX,
  ATTACHMENTS_TOTAL_BYTES,
  HUB_COMMANDS,
} from "../../shared/types";
import type {
  ComposerAttachment,
  ComposerSendRequest,
  HubCommandName,
} from "../../shared/types";
import { InvalidRequestError } from "../git/worktrees";
import { toAttachments } from "../opencode/client";
import type {
  PromptAttachments,
  RawCommand,
  RawFileAttachment,
} from "../opencode/client";

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

/** `data:<mime>;base64,<bytes>`; opencode only takes canonical base64. */
const DATA_URL =
  /^data:[^,;]*(?:;[^,;]+)*;base64,(?<payload>[A-Za-z0-9+/]*={0,2})$/u;

const MB = 1024 * 1024;

/** How many bytes an uploaded file holds; one that isn't a base64 `data:` URL or is too big is refused. */
const uploadBytes = (a: ComposerAttachment): number => {
  const payload = DATA_URL.exec(a.url)?.groups?.payload;
  if (payload === undefined || payload.length % 4 !== 0) {
    throw new InvalidRequestError(`"${a.name}" isn't a base64 data: URL`);
  }
  let padding = 0;
  if (payload.endsWith("==")) {
    padding = 2;
  } else if (payload.endsWith("=")) {
    padding = 1;
  }
  const bytes = (payload.length / 4) * 3 - padding;
  if (bytes > ATTACHMENT_MAX_BYTES) {
    throw new InvalidRequestError(
      `"${a.name}" is larger than ${ATTACHMENT_MAX_BYTES / MB} MB`
    );
  }
  return bytes;
};

/** The uploaded files as opencode's file attachments, which it reads from the `data:` URL itself. */
const uploadsOf = (
  uploads: readonly ComposerAttachment[]
): RawFileAttachment[] => {
  if (uploads.length > ATTACHMENTS_MAX) {
    throw new InvalidRequestError(
      `a message takes at most ${ATTACHMENTS_MAX} files`
    );
  }
  let total = 0;
  for (const a of uploads) {
    total += uploadBytes(a);
  }
  if (total > ATTACHMENTS_TOTAL_BYTES) {
    throw new InvalidRequestError(
      `the files are larger than ${ATTACHMENTS_TOTAL_BYTES / MB} MB together`
    );
  }
  return uploads.map((a) => ({ name: a.name, uri: a.url }));
};

/**
 * The message's mentions from `offset` on, and the files attached to it, as opencode's attachments; a bad mention
 * or file is the request's fault.
 */
export const attachmentsOf = (
  directory: string,
  request: ComposerSendRequest,
  offset = 0
): PromptAttachments => {
  const uploads = uploadsOf(request.attachments ?? []);
  let mentioned: PromptAttachments;
  try {
    mentioned = toAttachments(
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
  if (uploads.length === 0) {
    return mentioned;
  }
  return {
    ...mentioned,
    files: [...(mentioned.files ?? []), ...uploads],
  };
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
