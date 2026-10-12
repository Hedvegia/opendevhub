import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENTS_MAX,
  ATTACHMENTS_TOTAL_BYTES,
} from "../../../shared/types";

/** A file the composer holds for its next message. */
export interface PendingAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** `data:<mime>;base64,<bytes>`. */
  url: string;
}

const MB = 1024 * 1024;
// Not crypto.randomUUID: the hub may be served over plain http, where it doesn't exist.
let nextId = 0;

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error(`couldn't read ${file.name}`))
    );
    reader.readAsDataURL(file);
  });

/** A pasted image has no useful name ("image.png"); give it one that tells pastes apart. */
const nameOf = (file: File, n: number): string =>
  file.name && file.name !== "image.png"
    ? file.name
    : `pasted-${n}.${file.type.split("/")[1] || "png"}`;

/**
 * `files` added to what the composer already holds, read as `data:` URLs, or an error saying which limit they
 * break: opencode's per-file size, the count, or the total.
 */
export const addAttachments = async (
  held: PendingAttachment[],
  files: File[]
): Promise<PendingAttachment[]> => {
  if (held.length + files.length > ATTACHMENTS_MAX) {
    throw new Error(`A message takes at most ${ATTACHMENTS_MAX} files.`);
  }
  const big = files.find((f) => f.size > ATTACHMENT_MAX_BYTES);
  if (big) {
    throw new Error(
      `${big.name} is larger than ${ATTACHMENT_MAX_BYTES / MB} MB.`
    );
  }
  const total = [...held, ...files].reduce((sum, f) => sum + f.size, 0);
  if (total > ATTACHMENTS_TOTAL_BYTES) {
    throw new Error(
      `The files are larger than ${ATTACHMENTS_TOTAL_BYTES / MB} MB together.`
    );
  }
  const added = await Promise.all(
    files.map(async (file, i) => ({
      id: `attachment-${(nextId += 1)}`,
      mime: file.type,
      name: nameOf(file, held.length + i + 1),
      size: file.size,
      url: await readAsDataUrl(file),
    }))
  );
  return [...held, ...added];
};

export const formatSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return bytes < MB
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / MB).toFixed(1)} MB`;
};
