import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  OCR_CUSTOM_PRESET,
  OCR_DEFAULT_LIMITS,
  OCR_PROTOCOLS,
  OCR_VERSION,
  ocrPreset,
  ocrProviderLabel,
} from "../../shared/ocr";
import type {
  OcrEffective,
  OcrImport,
  OcrLimits,
  OcrProjectInput,
  OcrProjectSettings,
  OcrProtocol,
  OcrProvider,
  OcrProviderInput,
  OcrSettings,
  OcrSettingsInput,
} from "../../shared/ocr";
import type { Project } from "../../shared/types";
import type { ProjectSettingsStore } from "../config";
import { NotFoundError } from "../errors";
import type { SecretStore } from "../integrations/secrets";
import { IntegrationError, integrationUrl } from "../integrations/settings";

export class OcrSettingsError extends IntegrationError {
  constructor(message: string, status: 400 | 404 | 412 | 502 = 400) {
    super(message, status);
    this.name = "OcrSettingsError";
  }
}

const NAME = "Open Code Review";
const MAX_KEY = 4096;
const MAX_MODEL = 200;
const KEY_REF = /^[0-9a-f-]{36}$/u;
const MAX_CONCURRENCY = 64;
const MAX_MINUTES = 24 * 60;

/** A provider as saved: the key is a reference into the OS credential store. */
interface SavedProvider {
  preset: string;
  url: string;
  protocol: OcrProtocol | "";
  model: string;
  keyRef?: string;
}

interface SavedSettings {
  provider: SavedProvider;
  limits: OcrLimits;
}

const EMPTY_PROVIDER: SavedProvider = {
  model: "",
  preset: OCR_CUSTOM_PRESET,
  protocol: "",
  url: "",
};

/** The provider a review runs with; never leaves the server. */
export interface ResolvedOcrProvider {
  url: string;
  protocol: OcrProtocol;
  model: string;
  key: string;
  source: "global" | "project";
}

const isProtocol = (v: unknown): v is OcrProtocol =>
  typeof v === "string" && (OCR_PROTOCOLS as readonly string[]).includes(v);

const ocrUrl = (raw: string): string =>
  integrationUrl(raw, NAME, OcrSettingsError);

/** Reads a saved provider leniently: a hand-edited bad field reads as unset. */
const readProvider = (raw: unknown): SavedProvider => {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_PROVIDER };
  }
  const r = raw as Record<string, unknown>;
  let url = "";
  if (typeof r.url === "string" && r.url) {
    try {
      url = ocrUrl(r.url);
    } catch {
      url = "";
    }
  }
  return {
    model: typeof r.model === "string" ? r.model.trim() : "",
    preset:
      typeof r.preset === "string" && ocrPreset(r.preset)
        ? r.preset
        : OCR_CUSTOM_PRESET,
    protocol: isProtocol(r.protocol) ? r.protocol : "",
    url,
    ...(typeof r.keyRef === "string" && KEY_REF.test(r.keyRef)
      ? { keyRef: r.keyRef }
      : {}),
  };
};

const wholeNumber = (
  v: unknown,
  min: number,
  max: number
): number | undefined =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max
    ? v
    : undefined;

/** Valid limits, or an error naming the first bad one. */
export const validateLimits = (raw: unknown): OcrLimits => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const concurrency = wholeNumber(r.concurrency, 1, MAX_CONCURRENCY);
  if (concurrency === undefined) {
    throw new OcrSettingsError(
      `Concurrency must be a whole number from 1 to ${MAX_CONCURRENCY}.`
    );
  }
  const fileTimeout = wholeNumber(r.fileTimeout, 1, MAX_MINUTES);
  if (fileTimeout === undefined) {
    throw new OcrSettingsError(
      "The per-file timeout must be a whole number of minutes."
    );
  }
  const tokenBudget = wholeNumber(r.tokenBudget, 0, Number.MAX_SAFE_INTEGER);
  if (tokenBudget === undefined) {
    throw new OcrSettingsError(
      "The token budget must be a whole number (0 for unlimited)."
    );
  }
  const runLimit = wholeNumber(r.runLimit, 1, MAX_MINUTES);
  if (runLimit === undefined) {
    throw new OcrSettingsError(
      "The run limit must be a whole number of minutes."
    );
  }
  if (runLimit <= fileTimeout) {
    throw new OcrSettingsError(
      "The run limit must be longer than the per-file timeout."
    );
  }
  return { concurrency, fileTimeout, runLimit, tokenBudget };
};

const readLimits = (raw: unknown): OcrLimits => {
  try {
    return validateLimits({ ...OCR_DEFAULT_LIMITS, ...(raw as object) });
  } catch {
    return { ...OCR_DEFAULT_LIMITS };
  }
};

/** The fields of a provider form, validated; `complete` asks for URL, protocol and model. */
const validateFields = (
  input: OcrProviderInput,
  complete: boolean
): Omit<SavedProvider, "keyRef"> => {
  const url = input.url.trim() ? ocrUrl(input.url) : "";
  const model = input.model.trim();
  const { protocol } = input;
  if (protocol !== "" && !isProtocol(protocol)) {
    throw new OcrSettingsError(
      "Choose the anthropic, openai or openai-responses protocol."
    );
  }
  if (model.length > MAX_MODEL || /[\s]/u.test(model)) {
    throw new OcrSettingsError("Enter a model name without spaces.");
  }
  const any = url || model || protocol;
  if ((complete || any) && !url) {
    throw new OcrSettingsError(`Enter the ${NAME} base URL.`);
  }
  if ((complete || any) && !protocol) {
    throw new OcrSettingsError("Choose a protocol.");
  }
  if ((complete || any) && !model) {
    throw new OcrSettingsError("Enter a model.");
  }
  return {
    model,
    preset: ocrPreset(input.preset) ? input.preset : OCR_CUSTOM_PRESET,
    protocol,
    url,
  };
};

const suppliedKey = (input: OcrProviderInput): string | undefined => {
  const key = typeof input.key === "string" ? input.key.trim() : "";
  if (!key) {
    return undefined;
  }
  if (/\s/u.test(key) || key.length > MAX_KEY) {
    throw new OcrSettingsError("Enter the API key without spaces.");
  }
  if (input.clearKey) {
    throw new OcrSettingsError("Choose a new key or remove the saved key.");
  }
  return key;
};

const view = (p: SavedProvider): OcrProvider => ({
  hasKey: !!p.keyRef,
  model: p.model,
  preset: p.preset,
  protocol: p.protocol,
  url: p.url,
});

const effective = (
  p: { preset: string; url: string; model: string },
  source: "global" | "project",
  configured: boolean
): OcrEffective => ({
  configured,
  model: p.model,
  provider: p.url ? ocrProviderLabel(p) : "",
  source,
});

export interface OcrSettingsDeps {
  configDir: string;
  secrets: SecretStore;
  projects: ProjectSettingsStore;
  project: (id: string) => Project | undefined;
  /** `~/.opencodereview/config.json` on this machine. */
  hostConfig?: string;
  warn?: (message: string) => void;
}

/**
 * OCR's default provider and review limits (`<configDir>/ocr.json`), and each project's override (its
 * `config.json` entry, under `ocr`). Keys live in the OS credential store; files hold only references.
 */
export class OcrSettingsStore {
  private readonly deps: OcrSettingsDeps;
  private readonly file: string;
  private pending: Promise<void> = Promise.resolve();
  constructor(deps: OcrSettingsDeps) {
    this.deps = deps;
    this.file = path.join(deps.configDir, "ocr.json");
  }

  private get hostConfig(): string {
    return (
      this.deps.hostConfig ??
      path.join(os.homedir(), ".opencodereview", "config.json")
    );
  }

  /** Serializes edits, so concurrent requests can't lose a key reference. */
  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.pending.then(fn);
    this.pending = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private record(): SavedSettings {
    let raw: string;
    try {
      raw = fs.readFileSync(this.file, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          limits: { ...OCR_DEFAULT_LIMITS },
          provider: { ...EMPTY_PROVIDER },
        };
      }
      throw new OcrSettingsError(
        `Could not read the saved ${NAME} settings.`,
        502
      );
    }
    let value: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(raw);
      value =
        parsed && typeof parsed === "object" ? (parsed as typeof value) : {};
    } catch {
      value = {};
    }
    return {
      limits: readLimits(value.limits),
      provider: readProvider(value.provider),
    };
  }

  private write(value: SavedSettings): void {
    const tmp = `${this.file}.${randomUUID()}.tmp`;
    try {
      fs.mkdirSync(this.deps.configDir, { recursive: true });
      const { keyRef, ...rest } = value.provider;
      const saved = {
        limits: value.limits,
        provider: { ...rest, ...(keyRef ? { keyRef } : {}) },
      };
      fs.writeFileSync(tmp, `${JSON.stringify(saved, null, 2)}\n`, {
        flag: "wx",
        mode: 0o600,
      });
      fs.renameSync(tmp, this.file);
    } catch {
      throw new OcrSettingsError(`Could not save ${NAME} settings.`, 502);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  private pathOf(id: string): string {
    const project = this.deps.project(id);
    if (!project) {
      throw new NotFoundError(id);
    }
    return project.path;
  }

  private override(projectPath: string): SavedProvider | undefined {
    const raw = this.deps.projects.get(projectPath).ocr as
      | { mode?: unknown }
      | undefined;
    return raw?.mode === "custom" ? readProvider(raw) : undefined;
  }

  /** Stores a new key, or keeps or drops the old one; returns the reference and the one to delete afterwards. */
  private async keyRef(
    old: string | undefined,
    input: OcrProviderInput
  ): Promise<{ keyRef?: string; stale?: string }> {
    const key = suppliedKey(input);
    if (key) {
      const ref = randomUUID();
      await this.deps.secrets.set(ref, key);
      return { keyRef: ref, ...(old ? { stale: old } : {}) };
    }
    if (input.clearKey) {
      return old ? { stale: old } : {};
    }
    return old ? { keyRef: old } : {};
  }

  /** Commit first, then clean up: a stale credential never blocks a save. */
  private async drop(ref: string | undefined): Promise<void> {
    if (!ref) {
      return;
    }
    await this.deps.secrets.remove(ref).catch(() => {
      (this.deps.warn ?? console.warn)(
        `Could not delete a previous ${NAME} key (account ${ref}) from the OS credential store; remove it manually.`
      );
    });
  }

  private canImport(): boolean {
    return fs.existsSync(this.hostConfig);
  }

  view(): Promise<OcrSettings> {
    return this.locked(() => {
      const saved = this.record();
      return Promise.resolve({
        canImport: this.canImport(),
        limits: saved.limits,
        provider: view(saved.provider),
        version: OCR_VERSION,
      });
    });
  }

  limits(): OcrLimits {
    return this.record().limits;
  }

  save(input: OcrSettingsInput): Promise<OcrSettings> {
    return this.locked(async () => {
      const limits = validateLimits(input.limits);
      const fields = validateFields(input.provider, false);
      const old = this.record();
      const { keyRef, stale } = await this.keyRef(
        old.provider.keyRef,
        input.provider
      );
      const provider: SavedProvider = {
        ...fields,
        ...(keyRef ? { keyRef } : {}),
      };
      try {
        this.write({ limits, provider });
      } catch (error) {
        if (keyRef && keyRef !== old.provider.keyRef) {
          await this.deps.secrets.remove(keyRef).catch(() => undefined);
        }
        throw error;
      }
      await this.drop(stale);
      return {
        canImport: this.canImport(),
        limits,
        provider: view(provider),
        version: OCR_VERSION,
      };
    });
  }

  private projectSettings(projectPath: string): OcrProjectSettings {
    const global = this.record().provider;
    const own = this.override(projectPath);
    const globalConfigured = isComplete(global, !!global.keyRef);
    const globalView = effective(global, "global", globalConfigured);
    if (!own) {
      return {
        effective: globalView,
        global: globalView,
        override: { mode: "global" },
      };
    }
    return {
      effective: effective(
        own,
        "project",
        isComplete(own, !!(own.keyRef ?? global.keyRef))
      ),
      global: globalView,
      override: { mode: "custom", ...view(own) },
    };
  }

  projectView(id: string): Promise<OcrProjectSettings> {
    return this.locked(() =>
      Promise.resolve(this.projectSettings(this.pathOf(id)))
    );
  }

  saveProject(id: string, input: OcrProjectInput): Promise<OcrProjectSettings> {
    return this.locked(async () => {
      const projectPath = this.pathOf(id);
      const old = this.override(projectPath);
      if (input.mode === "global") {
        this.deps.projects.update(projectPath, { ocr: undefined });
        await this.drop(old?.keyRef);
        return this.projectSettings(projectPath);
      }
      const fields = validateFields(input, true);
      const { keyRef, stale } = await this.keyRef(old?.keyRef, input);
      try {
        this.deps.projects.update(projectPath, {
          ocr: { mode: "custom", ...fields, ...(keyRef ? { keyRef } : {}) },
        });
      } catch (error) {
        if (keyRef && keyRef !== old?.keyRef) {
          await this.deps.secrets.remove(keyRef).catch(() => undefined);
        }
        throw error;
      }
      await this.drop(stale);
      return this.projectSettings(projectPath);
    });
  }

  /** Removes a project's override and deletes its key. */
  forgetProject(projectPath: string): Promise<void> {
    return this.locked(async () => {
      const old = this.override(projectPath);
      if (!old) {
        return;
      }
      this.deps.projects.update(projectPath, { ocr: undefined });
      await this.drop(old.keyRef);
    });
  }

  private async keyOf(ref: string | undefined): Promise<string | undefined> {
    return ref ? await this.deps.secrets.get(ref) : undefined;
  }

  /** The provider a review in the project runs with; undefined until URL, protocol, model and key are all set. */
  resolve(projectId: string): Promise<ResolvedOcrProvider | undefined> {
    return this.locked(async () => {
      const global = this.record().provider;
      const own = this.override(this.pathOf(projectId));
      const p = own ?? global;
      const key =
        (await this.keyOf(own?.keyRef)) ?? (await this.keyOf(global.keyRef));
      if (!p.url || !p.protocol || !p.model || !key) {
        return undefined;
      }
      return {
        key,
        model: p.model,
        protocol: p.protocol,
        source: own ? "project" : "global",
        url: p.url,
      };
    });
  }

  /** The values `ocr llm test` runs with: the form's, with a missing key taken from the project, then the default. */
  testValues(
    input: OcrProviderInput,
    projectId?: string
  ): Promise<Omit<ResolvedOcrProvider, "source">> {
    return this.locked(async () => {
      const fields = validateFields(input, true);
      const protocol = fields.protocol as OcrProtocol;
      let key = suppliedKey(input);
      if (!key && !input.clearKey) {
        const own = projectId
          ? this.override(this.pathOf(projectId))
          : undefined;
        key =
          (await this.keyOf(own?.keyRef)) ??
          (await this.keyOf(this.record().provider.keyRef));
      }
      if (!key) {
        throw new OcrSettingsError("Enter an API key to test with.");
      }
      return { key, model: fields.model, protocol, url: fields.url };
    });
  }

  /** The active provider of `~/.opencodereview/config.json`, key included, to fill the form. */
  importHost(): OcrImport {
    let raw: string;
    try {
      raw = fs.readFileSync(this.hostConfig, "utf-8");
    } catch {
      throw new OcrSettingsError(
        `There is no ${this.hostConfig} to import.`,
        404
      );
    }
    let config: unknown;
    try {
      config = JSON.parse(raw);
    } catch {
      throw new OcrSettingsError(`${this.hostConfig} is not valid JSON.`);
    }
    return parseHostConfig(config);
  }
}

const isComplete = (
  p: { url: string; protocol: string; model: string },
  hasKey: boolean
): boolean => !!(p.url && p.protocol && p.model && hasKey);

/** OCR's legacy `use_anthropic` flag, when no protocol is named. */
const legacyProtocol = (useAnthropic: unknown): OcrProtocol | "" => {
  if (useAnthropic === true) {
    return "anthropic";
  }
  return useAnthropic === false ? "openai" : "";
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The active provider of an OCR config, as OCR resolves it (`provider` with its section, else the legacy `llm`). */
export const parseHostConfig = (config: unknown): OcrImport => {
  const c = (config && typeof config === "object" ? config : {}) as Record<
    string,
    unknown
  >;
  const name = str(c.provider);
  const section = (key: string): Record<string, unknown> => {
    const v = c[key];
    const entry =
      v && typeof v === "object"
        ? (v as Record<string, unknown>)[name]
        : undefined;
    return entry && typeof entry === "object"
      ? (entry as Record<string, unknown>)
      : {};
  };
  const protocolOf = (v: unknown): OcrProtocol | "" =>
    isProtocol(str(v)) ? (str(v) as OcrProtocol) : "";
  const withKey = (key: string) => (key ? { key } : {});
  if (name) {
    const preset = ocrPreset(name);
    if (preset) {
      const entry = section("providers");
      return {
        model: str(entry.model) || str(c.model) || (preset.models[0] ?? ""),
        preset: preset.name,
        protocol: protocolOf(entry.protocol) || preset.protocol,
        url: str(entry.url) || preset.url,
        ...withKey(str(entry.api_key)),
      };
    }
    const entry = section("custom_providers");
    if (Object.keys(entry).length === 0) {
      throw new OcrSettingsError(
        `The OCR config's provider "${name}" has no settings to import.`
      );
    }
    return {
      model: str(entry.model) || str(c.model),
      preset: OCR_CUSTOM_PRESET,
      protocol: protocolOf(entry.protocol),
      url: str(entry.url),
      ...withKey(str(entry.api_key)),
    };
  }
  const llm = (c.llm && typeof c.llm === "object" ? c.llm : {}) as Record<
    string,
    unknown
  >;
  if (!str(llm.url)) {
    throw new OcrSettingsError("The OCR config has no active provider.");
  }
  return {
    model: str(llm.model),
    preset: OCR_CUSTOM_PRESET,
    protocol: protocolOf(llm.protocol) || legacyProtocol(llm.use_anthropic),
    url: str(llm.url),
    ...withKey(str(llm.auth_token)),
  };
};
