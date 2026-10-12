import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { OCR_VERSION } from "../../shared/ocr";
import { IntegrationError } from "../integrations/settings";
import type { RunResult } from "../nodes/exec";

export { OCR_VERSION };

export type OcrPlatform =
  | "linux-x64"
  | "linux-arm64"
  | "darwin-x64"
  | "darwin-arm64";

/** SRI hashes of `@alibaba-group/ocr-<platform>@OCR_VERSION` (`npm view … dist.integrity`). */
export const OCR_INTEGRITY: Record<OcrPlatform, string> = {
  "darwin-arm64":
    "sha512-IkL1TuNULu5a/mYq4UBsPCttVh2GFTfWBwjcL8rAwtsb0X8+7mjUkg0KpiV5CITBPacy+fZnMYJo9O+okl5uMw==",
  "darwin-x64":
    "sha512-ky/Huq0W44pB+VpnuGnNZlGPY2OS2WJv1NtsxBmRUKEMD+YXO1N7VxfhP/d/wWNkXPyimoitnZf4ez6yqKMCGQ==",
  "linux-arm64":
    "sha512-r+AD1lJOzuQgvEtijLdO8iqalyAgNLw1hg5YLHJqjQhYTVtQbbK6Srien655H3ThYZumpZKyROIqooUeNtRXXA==",
  "linux-x64":
    "sha512-C5zwvzm1DCSv231jQkPwQqzM/GWefaTGROV6lx36AHWvVXyRDPSD18BOxbgJ5Fge/zJ8VRoEb4fjHAzAy6wlYg==",
};

/** The binary's entry in the package tarball (the launcher package names it `ocr`). */
const TAR_ENTRY = "package/bin/opencodereview";

/** Where the binary goes inside an environment; versioned, so an upgrade installs alongside. */
export const OCR_ENV_PATH = `/tmp/.opendevhub/ocr/${OCR_VERSION}/ocr`;

export const ocrTarballUrl = (platform: OcrPlatform): string =>
  `https://registry.npmjs.org/@alibaba-group/ocr-${platform}/-/ocr-${platform}-${OCR_VERSION}.tgz`;

export class OcrInstallError extends IntegrationError {
  constructor(message: string) {
    super(message, 502);
    this.name = "OcrInstallError";
  }
}

/** The platform of this machine, for running `ocr llm test` on the host. */
export const hostPlatform = (
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): OcrPlatform => {
  const os = platform === "darwin" ? "darwin" : "linux";
  if (platform !== "darwin" && platform !== "linux") {
    throw new OcrInstallError(
      `Open Code Review isn't bundled for ${platform} hosts.`
    );
  }
  if (arch === "arm64") {
    return `${os}-arm64`;
  }
  if (arch === "x64") {
    return `${os}-x64`;
  }
  throw new OcrInstallError(
    `Open Code Review isn't bundled for ${platform}/${arch}.`
  );
};

/** `uname -m` in a Linux environment. */
export const linuxPlatform = (machine: string): OcrPlatform => {
  const m = machine.trim();
  if (m === "x86_64" || m === "amd64") {
    return "linux-x64";
  }
  if (m === "aarch64" || m === "arm64") {
    return "linux-arm64";
  }
  throw new OcrInstallError(
    `Open Code Review isn't bundled for ${m || "this"} architecture.`
  );
};

const TAR_BLOCK = 512;

const tarString = (block: Buffer, from: number, length: number): string => {
  const raw = block.subarray(from, from + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString("utf-8");
};

/** One regular file from an uncompressed (ustar) tarball. */
export const tarEntry = (tar: Buffer, name: string): Buffer | undefined => {
  let at = 0;
  while (at + TAR_BLOCK <= tar.length) {
    const header = tar.subarray(at, at + TAR_BLOCK);
    if (header.every((b) => b === 0)) {
      return undefined;
    }
    const prefix = tarString(header, 345, 155);
    const base = tarString(header, 0, 100);
    const entry = prefix ? `${prefix}/${base}` : base;
    const size = Number.parseInt(tarString(header, 124, 12).trim() || "0", 8);
    const type = String.fromCodePoint(header[156] || 48);
    const body = at + TAR_BLOCK;
    if (entry === name && (type === "0" || type === "\0")) {
      return tar.subarray(body, body + size);
    }
    at = body + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
  }
  return undefined;
};

export const integrityOf = (data: Buffer): string =>
  `sha512-${createHash("sha512").update(data).digest("base64")}`;

export type Fetch = (url: string) => Promise<Response>;

export interface OcrBinaryDeps {
  configDir: string;
  fetch?: Fetch;
  /** Overrides the pinned hashes (tests). */
  integrity?: Partial<Record<OcrPlatform, string>>;
}

/** Downloads, verifies and caches the pinned `ocr` binary for each platform. */
export class OcrBinaries {
  private readonly deps: OcrBinaryDeps;
  private readonly inflight = new Map<OcrPlatform, Promise<string>>();
  constructor(deps: OcrBinaryDeps) {
    this.deps = deps;
  }

  /** `<configDir>/tools/ocr/<version>/<platform>/ocr`. */
  pathOf(platform: OcrPlatform): string {
    return path.join(
      this.deps.configDir,
      "tools",
      "ocr",
      OCR_VERSION,
      platform,
      "ocr"
    );
  }

  /** The cached binary's path, downloading it first when missing. Concurrent callers share one download. */
  ensureBinary(platform: OcrPlatform): Promise<string> {
    const running = this.inflight.get(platform);
    if (running) {
      return running;
    }
    const next = this.install(platform).finally(() =>
      this.inflight.delete(platform)
    );
    this.inflight.set(platform, next);
    return next;
  }

  private async install(platform: OcrPlatform): Promise<string> {
    const file = this.pathOf(platform);
    try {
      await fs.access(file, fs.constants.X_OK);
      return file;
    } catch {
      // not cached yet
    }
    const url = ocrTarballUrl(platform);
    let data: Buffer;
    try {
      const res = await (this.deps.fetch ?? fetch)(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      data = Buffer.from(await res.arrayBuffer());
    } catch (error) {
      throw new OcrInstallError(
        `Could not download Open Code Review from ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const expected = this.deps.integrity?.[platform] ?? OCR_INTEGRITY[platform];
    if (integrityOf(data) !== expected) {
      throw new OcrInstallError(
        `The Open Code Review download from ${url} does not match its pinned hash.`
      );
    }
    let binary: Buffer | undefined;
    try {
      binary = tarEntry(gunzipSync(data), TAR_ENTRY);
    } catch {
      binary = undefined;
    }
    if (!binary) {
      throw new OcrInstallError(
        `The Open Code Review package from ${url} has no ${TAR_ENTRY}.`
      );
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tmp, binary, { mode: 0o755 });
      await fs.rename(tmp, file);
    } finally {
      await fs.rm(tmp, { force: true });
    }
    return file;
  }
}

/** One environment as the installer reaches it. */
export interface OcrEnvPort {
  /** Runs a command in the environment's container. */
  exec: (command: string[]) => Promise<RunResult>;
  /** Copies a file of this machine into the container (`docker cp` on the machine running it). */
  copyIn: (localFile: string, containerPath: string) => Promise<void>;
}

/** Makes sure the environment has the pinned binary at OCR_ENV_PATH; returns that path. */
export const ensureInEnv = async (
  binaries: Pick<OcrBinaries, "ensureBinary">,
  env: OcrEnvPort,
  onInstall?: () => void
): Promise<string> => {
  const probe = await env.exec([
    "sh",
    "-c",
    'uname -m; test -x "$1" && echo present || true',
    "sh",
    OCR_ENV_PATH,
  ]);
  if (probe.exitCode !== 0) {
    throw new OcrInstallError(
      `Could not inspect the environment: ${probe.stderr.trim() || `exit ${probe.exitCode}`}`
    );
  }
  const [machine, present] = probe.stdout.trim().split(/\r?\n/u);
  const platform = linuxPlatform(machine ?? "");
  if (present?.trim() === "present") {
    return OCR_ENV_PATH;
  }
  onInstall?.();
  const local = await binaries.ensureBinary(platform);
  const dir = path.posix.dirname(OCR_ENV_PATH);
  const tmp = `${dir}/.ocr-${randomUUID()}`;
  const mkdir = await env.exec(["mkdir", "-p", dir]);
  if (mkdir.exitCode !== 0) {
    throw new OcrInstallError(
      `Could not create ${dir} in the environment: ${mkdir.stderr.trim()}`
    );
  }
  await env.copyIn(local, tmp);
  const move = await env.exec([
    "sh",
    "-c",
    'chmod 755 "$1" && mv -f "$1" "$2"',
    "sh",
    tmp,
    OCR_ENV_PATH,
  ]);
  if (move.exitCode !== 0) {
    throw new OcrInstallError(
      `Could not install Open Code Review in the environment: ${move.stderr.trim()}`
    );
  }
  return OCR_ENV_PATH;
};
