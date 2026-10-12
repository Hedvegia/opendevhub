import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ProjectSettingsStore } from "../../../src/server/config";
import {
  OcrSettingsStore,
  parseHostConfig,
} from "../../../src/server/ocr/settings";
import { OCR_DEFAULT_LIMITS } from "../../../src/shared/ocr";
import type { OcrProviderInput } from "../../../src/shared/ocr";
import { MemorySecretStore } from "../../helpers/secrets";

const dirs: string[] = [];
const tempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odh-ocr-settings-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

class MemoryProjectSettings implements ProjectSettingsStore {
  readonly entries = new Map<string, Record<string, unknown>>();
  get(projectPath: string) {
    return this.entries.get(projectPath) ?? {};
  }
  update(projectPath: string, patch: Record<string, unknown>) {
    const entry = { ...this.get(projectPath), ...patch };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) {
        delete entry[k];
      }
    }
    this.entries.set(projectPath, entry);
  }
}

const setup = (hostConfig?: unknown) => {
  const configDir = tempDir();
  const secrets = new MemorySecretStore();
  const projects = new MemoryProjectSettings();
  const hostFile = path.join(configDir, "host-ocr.json");
  if (hostConfig !== undefined) {
    fs.writeFileSync(hostFile, JSON.stringify(hostConfig));
  }
  const store = new OcrSettingsStore({
    configDir,
    hostConfig: hostFile,
    project: (id) =>
      ["shop", "work-api", "other"].includes(id)
        ? {
            devcontainerPath: `/src/${id}/.devcontainer/devcontainer.json`,
            id,
            name: id,
            path: `/src/${id}`,
          }
        : undefined,
    projects,
    secrets,
    warn: () => undefined,
  });
  return { configDir, projects, secrets, store };
};

const deepseek: OcrProviderInput = {
  model: "deepseek-v4-pro",
  preset: "deepseek",
  protocol: "openai",
  url: "https://api.deepseek.com",
};

describe("OcrSettingsStore: the default provider", () => {
  it("never returns the key, keeps it when saving without one, and deletes it when cleared", async () => {
    const { store, secrets, configDir } = setup();
    const saved = await store.save({
      limits: OCR_DEFAULT_LIMITS,
      provider: { ...deepseek, key: "sk-1" },
    });
    expect(JSON.stringify(saved)).not.toContain("sk-1");
    expect(saved.provider).toStrictEqual({
      hasKey: true,
      model: "deepseek-v4-pro",
      preset: "deepseek",
      protocol: "openai",
      url: "https://api.deepseek.com",
    });
    expect(
      fs.readFileSync(path.join(configDir, "ocr.json"), "utf-8")
    ).not.toContain("sk-1");
    expect([...secrets.values.values()]).toStrictEqual(["sk-1"]);

    await store.save({
      limits: { ...OCR_DEFAULT_LIMITS, concurrency: 2 },
      provider: { ...deepseek, model: "deepseek-flash" },
    });
    expect([...secrets.values.values()]).toStrictEqual(["sk-1"]);
    expect((await store.view()).provider.hasKey).toBe(true);
    expect(store.limits().concurrency).toBe(2);

    await store.save({
      limits: OCR_DEFAULT_LIMITS,
      provider: { ...deepseek, key: "sk-2" },
    });
    expect([...secrets.values.values()]).toStrictEqual(["sk-2"]);

    const cleared = await store.save({
      limits: OCR_DEFAULT_LIMITS,
      provider: { ...deepseek, clearKey: true },
    });
    expect(cleared.provider.hasKey).toBe(false);
    expect(secrets.values.size).toBe(0);
    expect(await store.resolve("shop")).toBeUndefined();
  });

  it("rejects plain HTTP to a remote host, a missing model and bad limits", async () => {
    const { store } = setup();
    await expect(
      store.save({
        limits: OCR_DEFAULT_LIMITS,
        provider: { ...deepseek, url: "http://llm.example.com/v1" },
      })
    ).rejects.toThrow(/Use HTTPS/u);
    await expect(
      store.save({
        limits: OCR_DEFAULT_LIMITS,
        provider: { ...deepseek, model: " " },
      })
    ).rejects.toThrow(/Enter a model/u);
    await expect(
      store.save({
        limits: { ...OCR_DEFAULT_LIMITS, fileTimeout: 20, runLimit: 15 },
        provider: deepseek,
      })
    ).rejects.toThrow(/run limit must be longer/u);
    await expect(
      store.save({
        limits: { ...OCR_DEFAULT_LIMITS, concurrency: 0 },
        provider: deepseek,
      })
    ).rejects.toThrow(/Concurrency/u);
  });

  it("allows HTTP on loopback and an empty provider", async () => {
    const { store } = setup();
    await expect(
      store.save({
        limits: OCR_DEFAULT_LIMITS,
        provider: {
          ...deepseek,
          preset: "litellm",
          url: "http://localhost:4000/v1",
        },
      })
    ).resolves.toMatchObject({ provider: { url: "http://localhost:4000/v1" } });
    await expect(
      store.save({
        limits: OCR_DEFAULT_LIMITS,
        provider: { model: "", preset: "custom", protocol: "", url: "" },
      })
    ).resolves.toMatchObject({ provider: { hasKey: false, url: "" } });
  });
});

describe("OcrSettingsStore: resolution and project overrides", () => {
  it("uses the default when the project has no override", async () => {
    const { store } = setup();
    await store.save({
      limits: OCR_DEFAULT_LIMITS,
      provider: { ...deepseek, key: "sk-g" },
    });
    expect(await store.resolve("shop")).toStrictEqual({
      key: "sk-g",
      model: "deepseek-v4-pro",
      protocol: "openai",
      source: "global",
      url: "https://api.deepseek.com",
    });
    expect((await store.projectView("shop")).effective).toStrictEqual({
      configured: true,
      model: "deepseek-v4-pro",
      provider: "DeepSeek API",
      source: "global",
    });
  });

  it("uses a model-only override with the default key", async () => {
    const { store, secrets } = setup();
    await store.save({
      limits: OCR_DEFAULT_LIMITS,
      provider: { ...deepseek, key: "sk-g" },
    });
    const view = await store.saveProject("shop", {
      ...deepseek,
      mode: "custom",
      model: "deepseek-flash",
    });
    expect(view.override).toMatchObject({ hasKey: false, mode: "custom" });
    expect(view.effective).toMatchObject({
      configured: true,
      model: "deepseek-flash",
      source: "project",
    });
    expect(await store.resolve("shop")).toMatchObject({
      key: "sk-g",
      model: "deepseek-flash",
      source: "project",
    });
    expect(await store.resolve("other")).toMatchObject({
      model: "deepseek-v4-pro",
    });
    expect(secrets.values.size).toBe(1);
  });

  it("uses a full override with its own key, and works without any default", async () => {
    const { store, projects } = setup();
    expect(await store.resolve("work-api")).toBeUndefined();
    await store.saveProject("work-api", {
      key: "sk-work",
      mode: "custom",
      model: "vllm/coding",
      preset: "custom",
      protocol: "openai",
      url: "https://gateway.example.com/api",
    });
    expect(JSON.stringify(projects.get("/src/work-api"))).not.toContain(
      "sk-work"
    );
    expect(await store.resolve("work-api")).toStrictEqual({
      key: "sk-work",
      model: "vllm/coding",
      protocol: "openai",
      source: "project",
      url: "https://gateway.example.com/api",
    });
    expect(await store.resolve("shop")).toBeUndefined();
    expect((await store.projectView("shop")).effective.configured).toBe(false);
  });

  it("deletes the override's key when the project goes back to the default or is forgotten", async () => {
    const { store, secrets } = setup();
    await store.saveProject("work-api", {
      ...deepseek,
      key: "sk-work",
      mode: "custom",
    });
    expect(secrets.values.size).toBe(1);
    await store.saveProject("work-api", { mode: "global" });
    expect(secrets.values.size).toBe(0);

    await store.saveProject("shop", {
      ...deepseek,
      key: "sk-shop",
      mode: "custom",
    });
    await store.forgetProject("/src/shop");
    expect(secrets.values.size).toBe(0);
    expect((await store.projectView("shop")).override).toStrictEqual({
      mode: "global",
    });
  });

  it("requires a complete provider for an override, and rejects unknown projects", async () => {
    const { store } = setup();
    await expect(
      store.saveProject("shop", { ...deepseek, mode: "custom", url: "" })
    ).rejects.toThrow(/base URL/u);
    await expect(store.projectView("nope")).rejects.toThrow(/nope/u);
  });

  it("tests with the form's key, else the project's, else the default key", async () => {
    const { store } = setup();
    await store.save({
      limits: OCR_DEFAULT_LIMITS,
      provider: { ...deepseek, key: "sk-g" },
    });
    await store.saveProject("work-api", {
      ...deepseek,
      key: "sk-work",
      mode: "custom",
    });
    expect((await store.testValues({ ...deepseek, key: "sk-new" })).key).toBe(
      "sk-new"
    );
    expect((await store.testValues(deepseek, "work-api")).key).toBe("sk-work");
    expect((await store.testValues(deepseek, "shop")).key).toBe("sk-g");
    await expect(
      store.testValues({ ...deepseek, clearKey: true })
    ).rejects.toThrow(/API key/u);
  });
});

describe("importing ~/.opencodereview/config.json", () => {
  it("takes only the active custom provider, with its key", () => {
    const { store } = setup({
      custom_providers: {
        askai: {
          api_key: "sk-askai",
          model: "vllm/coding",
          protocol: "openai",
          url: "https://ask-ai.example.com/api",
        },
        other: { api_key: "sk-other", url: "https://other.example.com" },
      },
      provider: "askai",
    });
    expect(store.importHost()).toStrictEqual({
      key: "sk-askai",
      model: "vllm/coding",
      preset: "custom",
      protocol: "openai",
      url: "https://ask-ai.example.com/api",
    });
  });

  it("takes a preset with its key and model, filling the preset's URL and protocol", () => {
    expect(
      parseHostConfig({
        model: "deepseek-flash",
        provider: "deepseek",
        providers: {
          deepseek: { api_key: "sk-ds" },
          openai: { api_key: "sk-oa" },
        },
      })
    ).toStrictEqual({
      key: "sk-ds",
      model: "deepseek-flash",
      preset: "deepseek",
      protocol: "openai",
      url: "https://api.deepseek.com",
    });
  });

  it("reads the legacy llm section and says when there is nothing to import", () => {
    expect(
      parseHostConfig({
        llm: {
          auth_token: "t",
          model: "m",
          url: "https://x.example.com",
          use_anthropic: true,
        },
      })
    ).toMatchObject({
      key: "t",
      protocol: "anthropic",
      url: "https://x.example.com",
    });
    expect(() => parseHostConfig({})).toThrow(/no active provider/u);
    const { store } = setup();
    expect(() => store.importHost()).toThrow(/no .* to import/u);
  });

  it("offers import only when the host file exists", async () => {
    expect((await setup().store.view()).canImport).toBe(false);
    expect((await setup({ provider: "deepseek" }).store.view()).canImport).toBe(
      true
    );
  });
});
