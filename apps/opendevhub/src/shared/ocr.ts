/** Open Code Review (`ocr`): the bundled version, its provider presets, and the settings the browser sees. */

export const OCR_VERSION = "1.12.13";

export const OCR_PROTOCOLS = [
  "anthropic",
  "openai",
  "openai-responses",
] as const;
export type OcrProtocol = (typeof OCR_PROTOCOLS)[number];

export interface OcrProviderPreset {
  /** OCR's provider name, as `ocr llm providers` lists it. */
  name: string;
  label: string;
  protocol: OcrProtocol;
  url: string;
  /** Models OCR suggests for it, first is its default. */
  models: string[];
}

export const OCR_CUSTOM_PRESET = "custom";

/**
 * A snapshot of `ocr llm providers` for OCR_VERSION (from `internal/llm/providers.go`). Providers that need
 * ambient credentials (Bedrock) are left out: opendevhub always passes a URL and a key.
 */
export const OCR_PROVIDER_PRESETS: readonly OcrProviderPreset[] = [
  {
    label: "Anthropic Claude API",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-opus-4-8"],
    name: "anthropic",
    protocol: "anthropic",
    url: "https://api.anthropic.com",
  },
  {
    label: "Baidu Qianfan API",
    models: ["ernie-5.1", "ernie-5.0", "deepseek-v4-pro"],
    name: "baidu-qianfan",
    protocol: "openai",
    url: "https://qianfan.baidubce.com/v2",
  },
  {
    label: "Alibaba DashScope API",
    models: ["qwen3.8-max", "qwen3.7-max", "qwen3.7-plus"],
    name: "dashscope",
    protocol: "openai",
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    label: "Alibaba DashScope Token Plan API",
    models: ["qwen3.8-max", "qwen3.7-max", "qwen3.7-plus"],
    name: "dashscope-tokenplan",
    protocol: "openai",
    url: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
  },
  {
    label: "DeepSeek API",
    models: ["deepseek-v4-pro", "deepseek-flash"],
    name: "deepseek",
    protocol: "openai",
    url: "https://api.deepseek.com",
  },
  {
    label: "Eden AI",
    models: ["anthropic/claude-opus-4-5", "openai/gpt-5.1"],
    name: "edenai",
    protocol: "openai",
    url: "https://api.edenai.run/v3",
  },
  {
    label: "Google Gemini API",
    models: ["gemini-3.1-pro", "gemini-3.6-flash"],
    name: "gemini",
    protocol: "openai",
    url: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  {
    label: "Tencent Hunyuan Token Plan API",
    models: ["hy3"],
    name: "hy-tokenplan",
    protocol: "openai",
    url: "https://api.lkeap.cloud.tencent.com/plan/v3",
  },
  {
    label: "iFlytek Spark API",
    models: ["4.0Ultra", "generalv3.5"],
    name: "iflytek",
    protocol: "openai",
    url: "https://spark-api-open.xf-yun.com/v1",
  },
  {
    label: "Kimi Moonshot API",
    models: ["kimi-k3", "kimi-k2.7-code"],
    name: "kimi",
    protocol: "openai",
    url: "https://api.moonshot.cn/v1",
  },
  {
    label: "Kimi Moonshot API (Global)",
    models: ["kimi-k3", "kimi-k2.7-code"],
    name: "kimi-global",
    protocol: "openai",
    url: "https://api.moonshot.ai/v1",
  },
  {
    label: "LiteLLM AI Gateway",
    models: ["anthropic/claude-sonnet-4-6", "openai/gpt-5.4"],
    name: "litellm",
    protocol: "openai",
    url: "http://localhost:4000/v1",
  },
  {
    label: "Xiaomi MiMo API",
    models: ["mimo-v2.5-pro", "mimo-v2.5"],
    name: "mimo",
    protocol: "openai",
    url: "https://api.xiaomimimo.com/v1",
  },
  {
    label: "MiniMax API",
    models: ["MiniMax-M3", "MiniMax-M2.7"],
    name: "minimax",
    protocol: "openai",
    url: "https://api.minimax.io/v1",
  },
  {
    label: "MiniMax CN API",
    models: ["MiniMax-M3", "MiniMax-M2.7"],
    name: "minimax-cn",
    protocol: "openai",
    url: "https://api.minimaxi.com/v1",
  },
  {
    label: "Mistral AI",
    models: ["codestral-latest", "mistral-large-latest"],
    name: "mistral",
    protocol: "openai",
    url: "https://api.mistral.ai/v1",
  },
  {
    label: "Novita API",
    models: ["moonshotai/kimi-k3", "zai-org/glm-5.2"],
    name: "novita",
    protocol: "openai",
    url: "https://api.novita.ai/openai",
  },
  {
    label: "Ollama Cloud API",
    models: ["deepseek-v4-pro", "kimi-k2.7-code", "glm-5.2"],
    name: "ollama-cloud",
    protocol: "openai",
    url: "https://ollama.com/v1",
  },
  {
    label: "OpenAI API",
    models: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"],
    name: "openai",
    protocol: "openai",
    url: "https://api.openai.com/v1",
  },
  {
    label: "OpenAI Responses API",
    models: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
    name: "openai-responses",
    protocol: "openai-responses",
    url: "https://api.openai.com/v1",
  },
  {
    label: "OpenRouter",
    models: ["anthropic/claude-opus-5", "openai/gpt-5.6-sol"],
    name: "openrouter",
    protocol: "openai",
    url: "https://openrouter.ai/api/v1",
  },
  {
    label: "SiliconFlow API",
    models: ["deepseek-ai/DeepSeek-V4-Pro", "zai-org/GLM-5.2"],
    name: "siliconflow",
    protocol: "openai",
    url: "https://api.siliconflow.com/v1",
  },
  {
    label: "SiliconFlow CN API",
    models: ["deepseek-ai/DeepSeek-V4-Pro", "zai-org/GLM-5.2"],
    name: "siliconflow-cn",
    protocol: "openai",
    url: "https://api.siliconflow.cn/v1",
  },
  {
    label: "Tencent TokenHub API",
    models: ["deepseek-v4-pro", "glm-5.2", "kimi-k2.7-code"],
    name: "tencent-tokenhub",
    protocol: "openai",
    url: "https://tokenhub.tencentmaas.com/v1",
  },
  {
    label: "Volcano Engine Ark API",
    models: ["doubao-seed-2-1-pro-260628", "doubao-seed-evolving"],
    name: "volcengine",
    protocol: "openai",
    url: "https://ark.cn-beijing.volces.com/api/v3",
  },
  {
    label: "xAI Grok API",
    models: ["grok-4.6", "grok-4.5"],
    name: "xai",
    protocol: "openai",
    url: "https://api.x.ai/v1",
  },
  {
    label: "Z.AI API",
    models: ["glm-5.3", "glm-5.2"],
    name: "z-ai",
    protocol: "openai",
    url: "https://open.bigmodel.cn/api/paas/v4",
  },
  {
    label: "Z.AI Coding Plan API",
    models: ["glm-5.3", "glm-5.2"],
    name: "z-ai-coding",
    protocol: "openai",
    url: "https://open.bigmodel.cn/api/coding/paas/v4",
  },
];

export const ocrPreset = (name: string): OcrProviderPreset | undefined =>
  OCR_PROVIDER_PRESETS.find((p) => p.name === name);

/** A provider as the browser sees it: never the key, only whether one is saved. */
export interface OcrProvider {
  /** A preset name, or OCR_CUSTOM_PRESET. */
  preset: string;
  url: string;
  /** Empty until chosen. */
  protocol: OcrProtocol | "";
  model: string;
  hasKey: boolean;
}

export interface OcrLimits {
  concurrency: number;
  /** Minutes per file (`--timeout`). */
  fileTimeout: number;
  /** Total tokens per run, 0 for unlimited (`--max-tokens-budget`). */
  tokenBudget: number;
  /** Minutes for the whole run; always longer than `fileTimeout`. */
  runLimit: number;
}

export const OCR_DEFAULT_LIMITS: OcrLimits = {
  concurrency: 8,
  fileTimeout: 15,
  runLimit: 30,
  tokenBudget: 0,
};

export interface OcrSettings {
  provider: OcrProvider;
  limits: OcrLimits;
  version: string;
  /** Whether `~/.opencodereview/config.json` exists on this machine, to offer importing it. */
  canImport: boolean;
}

/** What the browser sends to save a provider; the key is kept when omitted. */
export interface OcrProviderInput {
  preset: string;
  url: string;
  protocol: OcrProtocol | "";
  model: string;
  key?: string;
  clearKey?: boolean;
}

export interface OcrSettingsInput {
  provider: OcrProviderInput;
  limits: OcrLimits;
}

/** The provider a review in a project uses, for display. */
export interface OcrEffective {
  configured: boolean;
  source: "global" | "project";
  /** Empty when nothing is configured. */
  model: string;
  /** The preset's label, or the URL's host for a custom provider. */
  provider: string;
}

export type OcrProjectOverride =
  | { mode: "global" }
  | ({ mode: "custom" } & OcrProvider);

export interface OcrProjectSettings {
  override: OcrProjectOverride;
  effective: OcrEffective;
  /** The default provider, to show next to "Use the default". */
  global: OcrEffective;
}

export type OcrProjectInput =
  | { mode: "global" }
  | ({ mode: "custom" } & OcrProviderInput);

export interface OcrTestInput {
  provider: OcrProviderInput;
  /** Falls back to this project's saved key, then the default key. */
  projectId?: string;
}

export type OcrTestResult = { ok: true } | { ok: false; error: string };

/** The active provider of `~/.opencodereview/config.json`, to fill the form with. */
export interface OcrImport {
  preset: string;
  url: string;
  protocol: OcrProtocol | "";
  model: string;
  /** Only sent to fill the form; saving moves it into the credential store. */
  key?: string;
}

export const ocrProviderLabel = (p: {
  preset: string;
  url: string;
}): string => {
  const preset = ocrPreset(p.preset);
  if (preset) {
    return preset.label;
  }
  try {
    return new URL(p.url).host;
  } catch {
    return "Custom";
  }
};
