import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProjectSettingsStore } from "../../../src/server/config";
import { createDashboardApp } from "../../../src/server/dashboard-api";
import type { DashboardDeps } from "../../../src/server/dashboard-api";
import type { ToolEnv } from "../../../src/server/git/checkouts";
import type { RunResult } from "../../../src/server/nodes/exec";
import { OCR_ENV_PATH } from "../../../src/server/ocr/binary";
import { OcrService } from "../../../src/server/ocr/service";
import { OcrSettingsStore } from "../../../src/server/ocr/settings";
import type { AiReviewResult } from "../../../src/shared/forgejo";
import { OCR_DEFAULT_LIMITS } from "../../../src/shared/ocr";
import type { StoredAiReview } from "../../../src/shared/types";
import { MemorySecretStore } from "../../helpers/secrets";
import { memoryStores } from "../../helpers/stores";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

const fixture = (name: string): string =>
  fs.readFileSync(
    path.join(import.meta.dirname, "../../fixtures/ocr", name),
    "utf-8"
  );

const SHA = "a".repeat(40);
const DIR = "/workspaces/repo.worktrees/review-pr-7";
const details = {
  base: "main",
  body: "Fixes the thing",
  head: "fix",
  headSha: SHA,
  pull: {
    number: 7,
    owner: "team",
    repo: "repo",
    state: "open",
    title: "Fix it",
    url: "https://forge.example/team/repo/pulls/7",
  },
};

const ok = (stdout = ""): RunResult => ({
  exitCode: 0,
  stderr: "",
  stdout,
  timedOut: false,
});

const setup = (opts: { head?: string; review?: RunResult } = {}) => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "odh-ocr-routes-"));
  dirs.push(configDir);
  const entries = new Map<string, Record<string, unknown>>();
  const projects: ProjectSettingsStore = {
    get: (p) => entries.get(p) ?? {},
    update: (p, patch) => {
      const next = { ...entries.get(p), ...patch };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) {
          delete next[k];
        }
      }
      entries.set(p, next);
    },
  };
  const settings = new OcrSettingsStore({
    configDir,
    hostConfig: path.join(configDir, "none.json"),
    project: (id) => ({
      devcontainerPath: `/src/${id}/.devcontainer/devcontainer.json`,
      id,
      name: id,
      path: `/src/${id}`,
    }),
    projects,
    secrets: new MemorySecretStore(),
  });
  const exec = vi.fn(
    async (
      command: string[],
      runOpts?: {
        input?: string;
        timeoutMs?: number;
        onStderrLine?: (line: string) => void;
      }
    ): Promise<RunResult> => {
      if (command.includes("rev-parse")) {
        return ok(`${opts.head ?? SHA}\n`);
      }
      if (command.includes("remote")) {
        return ok(
          "upstream\tssh://git@forge.example/team/repo.git (fetch)\norigin\thttps://forge.example/me/repo.git (fetch)\n"
        );
      }
      if (command[0] === "sh" && command[2].startsWith("uname")) {
        return ok("x86_64\npresent\n");
      }
      if (command[3] === "ocr-review") {
        runOpts?.onStderrLine?.("[ocr] Reviewing file 1 with sk-default");
        runOpts?.onStderrLine?.('{"status":"success"}');
        return opts.review ?? ok(fixture("comments.json"));
      }
      return ok();
    }
  );
  const toolEnv = vi.fn((_id: string, _dir: string): ToolEnv => ({
    copyIn: vi.fn(async () => undefined),
    exec,
    project: { devcontainerPath: "", id: "p", name: "p", path: "/src/p" },
  }));
  const service = new OcrService({
    binaries: { ensureBinary: vi.fn(async () => "/cache/ocr") },
    run: vi.fn(async () => ok()),
    settings,
    toolEnv,
  });
  const { links } = memoryStores();
  const forgejo = {
    details: vi.fn(async () => details as never),
  } as unknown as DashboardDeps["forgejo"];
  const app = createDashboardApp({
    ...({} as DashboardDeps),
    forgejo,
    links,
    ocr: { service, settings },
  });
  const post = (body: unknown) =>
    app.request("/api/forgejo/pulls/team/repo/7/ocr-review", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  const reviews = async () =>
    (
      (await (
        await app.request("/api/forgejo/pulls/team/repo/7/ai-reviews")
      ).json()) as { reviews: StoredAiReview[] }
    ).reviews;
  return { app, exec, post, reviews, service, settings };
};

const where = { commitId: SHA, directory: DIR, projectId: "p" };

const configure = (settings: OcrSettingsStore, limits = OCR_DEFAULT_LIMITS) =>
  settings.save({
    limits,
    provider: {
      key: "sk-default",
      model: "deepseek-v4-pro",
      preset: "deepseek",
      protocol: "openai",
      url: "https://api.deepseek.com",
    },
  });

describe("local Open Code Review", () => {
  it("reviews uncommitted changes in workspace mode", async () => {
    const { exec, service, settings } = setup();
    configure(settings);
    const result = await service.reviewLocal({
      directory: DIR,
      mode: "working",
      projectId: "p",
    });
    expect(result.findings.length).toBeGreaterThan(0);
    const command = exec.mock.calls.find(
      ([args]) => args[3] === "ocr-review"
    )?.[0];
    expect(command).toBeDefined();
    expect(command).not.toContain("--from");
    expect(command).not.toContain("--to");
  });

  it("rejects a branch review when uncommitted files would be omitted", async () => {
    const { exec, service, settings } = setup();
    configure(settings);
    exec.mockImplementationOnce(async () => ok(" M src/a.ts\n"));
    await expect(
      service.reviewLocal({
        base: "main",
        directory: DIR,
        mode: "branch",
        projectId: "p",
      })
    ).rejects.toThrow(/Commit the uncommitted changes/u);
    expect(exec.mock.calls.some(([args]) => args[3] === "ocr-review")).toBe(
      false
    );
  });
});

describe("POST …/ocr-review", () => {
  it("makes live OCR progress available without the JSON result or provider key", async () => {
    const { app, post, settings } = setup();
    await configure(settings);
    const runId = "ocr-progress-test";
    const result = await post({ ...where, runId });
    expect(result.status).toBe(200);
    const logs = await app.request(`/api/ocr/runs/${runId}/logs`);
    expect(await logs.json()).toStrictEqual({
      lines: ["[ocr] Reviewing file 1 with [redacted]"],
    });
  });
  it("asks to set up OCR first when the project has no provider", async () => {
    const { post, exec } = setup();
    const res = await post(where);
    expect(res.status).toBe(412);
    expect(await res.json()).toStrictEqual({
      error: "Set up Open Code Review in Settings.",
    });
    expect(exec).not.toHaveBeenCalled();
  });

  it("runs with the project's override and the global limits, the key on stdin, and stores the review", async () => {
    const { post, exec, settings, reviews } = setup();
    await configure(settings, {
      ...OCR_DEFAULT_LIMITS,
      concurrency: 2,
      runLimit: 40,
    });
    await settings.saveProject("p", {
      mode: "custom",
      model: "deepseek-flash",
      preset: "deepseek",
      protocol: "openai",
      url: "https://api.deepseek.com",
    });
    const res = await post(where);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiReviewResult;
    expect(body.findings).toHaveLength(3);
    expect(body.stats).toStrictEqual({
      filesReviewed: 3,
      filesSkipped: 1,
      status: "partial",
      inputTokens: 45_002,
      outputTokens: 3209,
      totalTokens: 48_211,
    });

    const fetch = exec.mock.calls.find(([c]) => c.includes("fetch"))?.[0];
    expect(fetch?.slice(-2)).toStrictEqual([
      "upstream",
      "+refs/heads/main:refs/remotes/upstream/main",
    ]);
    const [command, opts] =
      exec.mock.calls.find(([c]) => c[3] === "ocr-review") ?? [];
    expect(command?.slice(4, 9)).toStrictEqual([
      OCR_ENV_PATH,
      DIR,
      "https://api.deepseek.com",
      "openai",
      "deepseek-flash",
    ]);
    expect(command).toContain("upstream/main");
    expect(command?.[command.indexOf("--concurrency") + 1]).toBe("2");
    expect(command?.[command.indexOf("--to") + 1]).toBe(SHA);
    expect(command?.join(" ")).not.toContain("sk-default");
    expect(opts).toStrictEqual({
      input: "sk-default\n",
      timeoutMs: 40 * 60_000,
    });

    const [stored] = await reviews();
    expect(stored).toMatchObject({
      headSha: SHA,
      mode: "ocr",
      stats: { filesReviewed: 3, filesSkipped: 1 },
    });
    expect(stored.sessionId).toBeUndefined();
    expect(stored.findings[0]).toMatchObject({
      category: "bug",
      suggestion: expect.any(String),
    });
  });

  it("refuses a checkout at another commit before running OCR", async () => {
    const { post, exec, settings } = setup({ head: "b".repeat(40) });
    await configure(settings);
    const res = await post(where);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /Update the checkout first/u
    );
    expect(exec.mock.calls.some(([c]) => c[3] === "ocr-review")).toBe(false);
  });

  it("fails with OCR's error and stores nothing", async () => {
    const { post, settings, reviews } = setup({
      review: {
        exitCode: 1,
        stderr: fixture("failed.stderr"),
        stdout: "",
        timedOut: false,
      },
    });
    await configure(settings);
    const res = await post(where);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /401 Unauthorized/u
    );
    expect(await reviews()).toStrictEqual([]);
  });

  it("says when the run limit stopped OCR", async () => {
    const { post, settings } = setup({
      review: { exitCode: 143, stderr: "", stdout: "", timedOut: true },
    });
    await configure(settings);
    const res = await post(where);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /run limit of 30 minutes/u
    );
  });
});

describe("OCR settings routes", () => {
  it("saves and reads settings without ever returning the key", async () => {
    const { app } = setup();
    const put = await app.request("/api/ocr/settings", {
      body: JSON.stringify({
        limits: OCR_DEFAULT_LIMITS,
        provider: {
          key: "sk-x",
          model: "deepseek-v4-pro",
          preset: "deepseek",
          protocol: "openai",
          url: "https://api.deepseek.com",
        },
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(put.status).toBe(200);
    const text = await (await app.request("/api/ocr/settings")).text();
    expect(text).not.toContain("sk-x");
    expect(JSON.parse(text)).toMatchObject({
      provider: { hasKey: true },
      version: "1.12.13",
    });
    const project = await app.request("/api/projects/p/ocr");
    expect(await project.json()).toMatchObject({
      effective: {
        configured: true,
        model: "deepseek-v4-pro",
        source: "global",
      },
      override: { mode: "global" },
    });
  });

  it("rejects a malformed body", async () => {
    const { app } = setup();
    const res = await app.request("/api/ocr/settings", {
      body: JSON.stringify({ provider: { url: 1 } }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(res.status).toBe(400);
  });
});

describe("OcrService.test", () => {
  it("runs ocr llm test with the key on stdin and trims the error, never echoing the key", async () => {
    const { settings } = setup();
    await configure(settings);
    const run = vi.fn(
      async (
        _cmd: string,
        _args: string[],
        _opts?: { input?: string | Buffer }
      ) => ({
        exitCode: 1,
        stderr: `\u001B[31m[ocr] Error: authentication: 401 for key sk-default\u001B[0m\n`,
        stdout: "",
        timedOut: false,
      })
    );
    const service = new OcrService({
      binaries: { ensureBinary: vi.fn(async () => "/cache/ocr") },
      run,
      settings,
      toolEnv: () => {
        throw new Error("not used");
      },
    });
    const result = await service.test({
      provider: {
        model: "m",
        preset: "custom",
        protocol: "openai",
        url: "https://x.example.com",
      },
    });
    expect(result).toStrictEqual({
      error: "[ocr] Error: authentication: 401 for key [redacted]",
      ok: false,
    });
    const [, args, opts] = run.mock.calls[0];
    expect(args.join(" ")).not.toContain("sk-default");
    expect(opts?.input).toBe("sk-default\n");
  });
});
