import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OCR_ENV_PATH,
  OcrBinaries,
  OcrInstallError,
  ensureInEnv,
  hostPlatform,
  integrityOf,
  linuxPlatform,
} from "../../../src/server/ocr/binary";
import type { OcrEnvPort } from "../../../src/server/ocr/binary";

const dirs: string[] = [];
const tempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odh-ocr-bin-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

/** A package tarball shaped like `@alibaba-group/ocr-<platform>`. */
const packageTarball = (content = "#!/bin/sh\necho ocr\n"): Buffer => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "package", "bin"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package", "package.json"), "{}");
  fs.writeFileSync(path.join(dir, "package", "bin", "opencodereview"), content);
  execFileSync("tar", ["czf", "pkg.tgz", "package"], { cwd: dir });
  return fs.readFileSync(path.join(dir, "pkg.tgz"));
};

const fetchOf = (data: Buffer) =>
  vi.fn(async (_url: string) => new Response(new Uint8Array(data)));

describe("OcrBinaries", () => {
  it("downloads, verifies and caches the binary as an executable", async () => {
    const tgz = packageTarball();
    const fetch = fetchOf(tgz);
    const configDir = tempDir();
    const binaries = new OcrBinaries({
      configDir,
      fetch,
      integrity: { "linux-x64": integrityOf(tgz) },
    });
    const file = await binaries.ensureBinary("linux-x64");
    expect(file).toBe(
      path.join(configDir, "tools", "ocr", "1.12.13", "linux-x64", "ocr")
    );
    expect(fs.readFileSync(file, "utf-8")).toContain("echo ocr");
    expect(fs.statSync(file).mode & 0o777).toBe(0o755);
    expect(fetch).toHaveBeenCalledWith(
      "https://registry.npmjs.org/@alibaba-group/ocr-linux-x64/-/ocr-linux-x64-1.12.13.tgz"
    );
    await binaries.ensureBinary("linux-x64");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("caches nothing when the download does not match the pinned hash", async () => {
    const configDir = tempDir();
    const binaries = new OcrBinaries({
      configDir,
      fetch: fetchOf(packageTarball("tampered")),
      integrity: { "linux-x64": integrityOf(packageTarball()) },
    });
    await expect(binaries.ensureBinary("linux-x64")).rejects.toThrow(
      /does not match its pinned hash/u
    );
    expect(fs.existsSync(path.join(configDir, "tools"))).toBe(false);
  });

  it("downloads once for concurrent callers", async () => {
    const tgz = packageTarball();
    const fetch = fetchOf(tgz);
    const binaries = new OcrBinaries({
      configDir: tempDir(),
      fetch,
      integrity: { "linux-arm64": integrityOf(tgz) },
    });
    const [a, b] = await Promise.all([
      binaries.ensureBinary("linux-arm64"),
      binaries.ensureBinary("linux-arm64"),
    ]);
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("names the URL when the download fails", async () => {
    const binaries = new OcrBinaries({
      configDir: tempDir(),
      fetch: async () => new Response("nope", { status: 503 }),
    });
    await expect(binaries.ensureBinary("darwin-arm64")).rejects.toThrow(
      /registry\.npmjs\.org.*HTTP 503/u
    );
  });
});

describe("platforms", () => {
  it("maps uname -m and the host to bundled platforms", () => {
    expect(linuxPlatform("x86_64\n")).toBe("linux-x64");
    expect(linuxPlatform("aarch64")).toBe("linux-arm64");
    expect(() => linuxPlatform("riscv64")).toThrow(OcrInstallError);
    expect(hostPlatform("darwin", "arm64")).toBe("darwin-arm64");
    expect(hostPlatform("linux", "x64")).toBe("linux-x64");
    expect(() => hostPlatform("win32", "x64")).toThrow(OcrInstallError);
  });
});

describe("ensureInEnv", () => {
  const result = (stdout: string, exitCode = 0) => ({
    exitCode,
    stderr: "",
    stdout,
    timedOut: false,
  });

  it("skips the copy when the environment has the binary", async () => {
    const binaries = { ensureBinary: vi.fn(async () => "/cache/ocr") };
    const env: OcrEnvPort = {
      copyIn: vi.fn(async () => undefined),
      exec: vi.fn(async () => result("x86_64\npresent\n")),
    };
    const onInstall = vi.fn();
    await expect(ensureInEnv(binaries, env, onInstall)).resolves.toBe(
      OCR_ENV_PATH
    );
    expect(binaries.ensureBinary).not.toHaveBeenCalled();
    expect(env.copyIn).not.toHaveBeenCalled();
    expect(onInstall).not.toHaveBeenCalled();
  });

  it("copies the arm64 binary into an aarch64 environment that lacks it", async () => {
    const binaries = { ensureBinary: vi.fn(async () => "/cache/arm/ocr") };
    const exec = vi.fn(async (command: string[]) =>
      result(
        command[0] === "sh" && command[2].startsWith("uname") ? "aarch64\n" : ""
      )
    );
    const copyIn = vi.fn(async (_local: string, _dest: string) => undefined);
    const onInstall = vi.fn();
    await ensureInEnv(binaries, { copyIn, exec }, onInstall);
    expect(binaries.ensureBinary).toHaveBeenCalledWith("linux-arm64");
    expect(onInstall).toHaveBeenCalledOnce();
    const [local, tmp] = copyIn.mock.calls[0];
    expect(local).toBe("/cache/arm/ocr");
    expect(path.posix.dirname(tmp)).toBe(path.posix.dirname(OCR_ENV_PATH));
    expect(exec.mock.calls.at(-1)?.[0].slice(-2)).toStrictEqual([
      tmp,
      OCR_ENV_PATH,
    ]);
  });
});
