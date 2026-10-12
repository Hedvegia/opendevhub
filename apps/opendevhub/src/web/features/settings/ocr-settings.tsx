import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon, DownloadIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { confirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  OCR_CUSTOM_PRESET,
  OCR_DEFAULT_LIMITS,
  OCR_PROVIDER_PRESETS,
  ocrPreset,
} from "../../../shared/ocr";
import type {
  OcrLimits,
  OcrProtocol,
  OcrProvider,
  OcrProviderInput,
  OcrSettings,
  OcrTestResult,
} from "../../../shared/ocr";
import {
  fetchOcrSettings,
  fetchProjectOcr,
  importOcrConfig,
  saveOcrSettings,
  testOcrConnection,
} from "../../api";
import { Choice } from "../../components/choice";
import { Note } from "../../components/page";
import { SettingsBlock, SettingsHeader } from "./settings-layout";

export const OCR_SECTION = "open-code-review";

export const ocrSettingsKey = ["ocr-settings"] as const;
export const projectOcrKey = (projectId: string) =>
  ["project-ocr", projectId] as const;

export const useOcrSettings = () =>
  useQuery({
    queryFn: ({ signal }) => fetchOcrSettings(signal),
    queryKey: ocrSettingsKey,
  });

/** The project's override and the provider its reviews use. */
export const useProjectOcr = (projectId: string | undefined) =>
  useQuery({
    enabled: !!projectId,
    queryFn: ({ signal }) => fetchProjectOcr(projectId ?? "", signal),
    queryKey: projectOcrKey(projectId ?? ""),
  });

const message = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/** A provider being edited: the saved fields, a key typed in, and whether the saved key goes. */
export interface OcrDraft {
  preset: string;
  url: string;
  protocol: OcrProtocol | "";
  model: string;
  key: string;
  clearKey: boolean;
}

export const draftOf = (p?: Omit<OcrProvider, "hasKey">): OcrDraft => ({
  clearKey: false,
  key: "",
  model: p?.model ?? "",
  preset: p?.preset ?? OCR_CUSTOM_PRESET,
  protocol: p?.protocol ?? "",
  url: p?.url ?? "",
});

/** What the API takes: the key only when one was typed. */
export const providerInput = (d: OcrDraft): OcrProviderInput => ({
  model: d.model.trim(),
  preset: d.preset,
  protocol: d.protocol,
  url: d.url.trim(),
  ...(d.key.trim() ? { key: d.key.trim() } : {}),
  ...(d.clearKey ? { clearKey: true } : {}),
});

const PRESET_OPTIONS = [
  { label: "Custom", value: OCR_CUSTOM_PRESET },
  ...OCR_PROVIDER_PRESETS.map((p) => ({ label: p.label, value: p.name })),
];

const PROTOCOL_OPTIONS = [
  { label: "Choose…", value: "" },
  { label: "OpenAI chat completions (openai)", value: "openai" },
  { label: "OpenAI Responses (openai-responses)", value: "openai-responses" },
  { label: "Anthropic Messages (anthropic)", value: "anthropic" },
];

/** Preset, base URL, protocol, model and API key; picking a preset fills its URL, protocol and default model. */
export const OcrProviderFields = (props: {
  id: string;
  draft: OcrDraft;
  onChange: (draft: OcrDraft) => void;
  /** A key is saved for this provider. */
  hasKey: boolean;
  keyHint: string;
}) => {
  const { draft, id } = props;
  const [replacing, setReplacing] = useState(false);
  const set = (change: Partial<OcrDraft>) =>
    props.onChange({ ...draft, ...change });
  const preset = ocrPreset(draft.preset);
  const showSaved = props.hasKey && !draft.clearKey && !replacing;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-preset`}>Provider</Label>
          <Choice
            id={`${id}-preset`}
            size="default"
            value={draft.preset}
            options={PRESET_OPTIONS}
            onChange={(value) => {
              const next = ocrPreset(value);
              set(
                next
                  ? {
                      model: next.models.includes(draft.model)
                        ? draft.model
                        : (next.models[0] ?? ""),
                      preset: value,
                      protocol: next.protocol,
                      url: next.url,
                    }
                  : { preset: value }
              );
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-protocol`}>Protocol</Label>
          <Choice
            id={`${id}-protocol`}
            size="default"
            value={draft.protocol}
            options={PROTOCOL_OPTIONS}
            onChange={(value) => set({ protocol: value as OcrProtocol | "" })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-url`}>Base URL</Label>
        <Input
          id={`${id}-url`}
          type="url"
          placeholder="https://api.example.com/v1"
          value={draft.url}
          onChange={(e) => set({ url: e.target.value })}
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-muted-foreground text-sm">
          Use HTTPS; a local gateway may use loopback HTTP.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-model`}>Model</Label>
        <Input
          id={`${id}-model`}
          className="font-mono"
          list={preset ? `${id}-models` : undefined}
          placeholder={preset?.models[0] ?? "provider/model"}
          value={draft.model}
          onChange={(e) => set({ model: e.target.value })}
          autoComplete="off"
          spellCheck={false}
        />
        {preset && (
          <datalist id={`${id}-models`}>
            {preset.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-key`}>API key</Label>
        {showSaved ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ok inline-flex items-center gap-1.5 text-sm">
              <CircleCheckIcon className="size-4" /> Key saved
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReplacing(true)}
            >
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={async () => {
                if (
                  await confirm({
                    confirmLabel: "Remove key",
                    description:
                      "Reviews can't run with this provider until a key is saved again.",
                    destructive: true,
                    title: "Remove the API key?",
                  })
                ) {
                  set({ clearKey: true, key: "" });
                }
              }}
            >
              Remove…
            </Button>
          </div>
        ) : (
          <Input
            id={`${id}-key`}
            type="password"
            value={draft.key}
            onChange={(e) => set({ clearKey: false, key: e.target.value })}
            placeholder="Paste an API key"
            autoComplete="new-password"
            spellCheck={false}
          />
        )}
        <p className="text-muted-foreground text-sm">
          {draft.clearKey ? "The saved key is removed when you save. " : ""}
          {props.keyHint} Keys live in your operating system&apos;s credential
          store, never in the settings file or the browser.
        </p>
      </div>
    </div>
  );
};

/** Test connection: `ocr llm test` on this machine with the form's values. */
export const OcrTestButton = (props: {
  draft: OcrDraft;
  projectId?: string;
  disabled?: boolean;
}) => {
  const test = useMutation({
    mutationFn: () =>
      testOcrConnection({
        provider: providerInput(props.draft),
        ...(props.projectId ? { projectId: props.projectId } : {}),
      }),
  });
  const { reset } = test;
  const { url, protocol, model, key } = props.draft;
  useEffect(() => reset(), [reset, url, protocol, model, key]);
  const result: OcrTestResult | undefined = test.data;
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={props.disabled || test.isPending || !url.trim()}
        onClick={() => test.mutate()}
      >
        {test.isPending ? "Testing…" : "Test connection"}
      </Button>
      {result?.ok && (
        <p role="status" className="text-ok text-sm">
          Connected: the model answered and handled a tool call.
        </p>
      )}
      {(result?.ok === false || test.error) && (
        <div role="alert">
          <Note error>
            <span className="font-mono text-xs whitespace-pre-wrap">
              {result?.ok === false ? result.error : message(test.error)}
            </span>
          </Note>
        </div>
      )}
    </div>
  );
};

const LIMITS: {
  key: keyof OcrLimits;
  label: string;
  hint: string;
  min: number;
}[] = [
  {
    hint: "Files reviewed at the same time.",
    key: "concurrency",
    label: "Concurrency",
    min: 1,
  },
  {
    hint: "Minutes OCR spends on one file before giving up on it.",
    key: "fileTimeout",
    label: "Per-file timeout (min)",
    min: 1,
  },
  {
    hint: "Total tokens per review; 0 for unlimited.",
    key: "tokenBudget",
    label: "Token budget",
    min: 0,
  },
  {
    hint: "Minutes before the whole review is stopped; longer than the per-file timeout.",
    key: "runLimit",
    label: "Run limit (min)",
    min: 1,
  },
];

const LimitsFields = (props: {
  limits: Record<keyof OcrLimits, string>;
  onChange: (key: keyof OcrLimits, value: string) => void;
}) => (
  <div className="grid gap-4 sm:grid-cols-2">
    {LIMITS.map((l) => (
      <div key={l.key} className="flex flex-col gap-1.5">
        <Label htmlFor={`ocr-limit-${l.key}`}>{l.label}</Label>
        <Input
          id={`ocr-limit-${l.key}`}
          type="number"
          inputMode="numeric"
          min={l.min}
          step={1}
          className="max-w-40"
          value={props.limits[l.key]}
          onChange={(e) => props.onChange(l.key, e.target.value)}
        />
        <p className="text-muted-foreground text-sm">{l.hint}</p>
      </div>
    ))}
  </div>
);

const limitsText = (l: OcrLimits): Record<keyof OcrLimits, string> => ({
  concurrency: String(l.concurrency),
  fileTimeout: String(l.fileTimeout),
  runLimit: String(l.runLimit),
  tokenBudget: String(l.tokenBudget),
});

const limitsOf = (t: Record<keyof OcrLimits, string>): OcrLimits => ({
  concurrency: Number(t.concurrency),
  fileTimeout: Number(t.fileTimeout),
  runLimit: Number(t.runLimit),
  tokenBudget: Number(t.tokenBudget),
});

/** The settings section: the default provider every project uses, and the review limits. */
export const OcrSettingsSection = () => {
  const query = useOcrSettings();
  return (
    <>
      <SettingsHeader
        title="Open Code Review"
        description="Open Code Review (ocr) reviews a pull request file by file and suggests code. opendevhub ships it and runs it in the checkout's container, with the model you set here."
      />
      {query.error && <Note error>{query.error.message}</Note>}
      {!query.data && !query.error && (
        <p role="status" className="text-muted-foreground text-sm">
          Loading settings…
        </p>
      )}
      {query.data && <OcrSettingsForm settings={query.data} />}
    </>
  );
};

export const OcrSettingsForm = ({ settings }: { settings: OcrSettings }) => {
  const client = useQueryClient();
  const [draft, setDraft] = useState(() => draftOf(settings.provider));
  const [limits, setLimits] = useState(() => limitsText(settings.limits));
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      saveOcrSettings({
        limits: limitsOf(limits),
        provider: providerInput(draft),
      }),
    onSuccess: async (next) => {
      client.setQueryData(ocrSettingsKey, next);
      setDraft(draftOf(next.provider));
      setLimits(limitsText(next.limits));
      setSaved(true);
      await client.invalidateQueries({ queryKey: ["project-ocr"] });
    },
  });
  const imported = useMutation({
    mutationFn: importOcrConfig,
    onSuccess: (found) => {
      setDraft({
        clearKey: false,
        key: found.key ?? "",
        model: found.model,
        preset: found.preset,
        protocol: found.protocol,
        url: found.url,
      });
      setSaved(false);
    },
  });
  const change = (next: OcrDraft) => {
    setDraft(next);
    setSaved(false);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const busy = save.isPending || imported.isPending;
  return (
    <form className="flex flex-col gap-8" onSubmit={submit}>
      <SettingsBlock
        title="Default provider"
        hint="Every project reviews with this provider unless its own settings choose another."
        action={
          settings.canImport && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => imported.mutate()}
            >
              <DownloadIcon /> Import from ~/.opencodereview
            </Button>
          )
        }
      >
        <fieldset disabled={busy} className="disabled:opacity-60">
          <OcrProviderFields
            id="ocr-default"
            draft={draft}
            onChange={change}
            hasKey={settings.provider.hasKey}
            keyHint="Saving without a new key keeps the saved one."
          />
        </fieldset>
        {imported.isSuccess && (
          <p role="status" className="text-muted-foreground text-sm">
            Filled in from ~/.opencodereview/config.json. Save to keep it.
          </p>
        )}
        {imported.error && <Note error>{imported.error.message}</Note>}
        <OcrTestButton draft={draft} disabled={busy} />
      </SettingsBlock>
      <SettingsBlock
        title="Review limits"
        hint="Apply to every Open Code Review run, in every project."
      >
        <fieldset disabled={busy} className="disabled:opacity-60">
          <LimitsFields
            limits={limits}
            onChange={(key, value) => {
              setLimits((current) => ({ ...current, [key]: value }));
              setSaved(false);
            }}
          />
        </fieldset>
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setLimits(limitsText(OCR_DEFAULT_LIMITS))}
          >
            Reset to defaults
          </Button>
        </div>
      </SettingsBlock>
      <div className="flex flex-wrap items-center gap-3 border-t pt-6">
        <Button type="submit" disabled={busy}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <span className="text-muted-foreground text-sm">
          Bundled Open Code Review {settings.version}
        </span>
      </div>
      {save.error && (
        <div role="alert">
          <Note error>{save.error.message}</Note>
        </div>
      )}
      {saved && (
        <p role="status" className="text-muted-foreground text-sm">
          Settings saved.
        </p>
      )}
    </form>
  );
};
