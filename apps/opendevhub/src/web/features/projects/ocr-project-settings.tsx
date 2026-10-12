import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import type { OcrEffective, OcrProjectSettings } from "../../../shared/ocr";
import { saveProjectOcr } from "../../api";
import { muted, Note } from "../../components/page";
import {
  draftOf,
  OCR_SECTION,
  OcrProviderFields,
  OcrTestButton,
  projectOcrKey,
  providerInput,
  useOcrSettings,
  useProjectOcr,
} from "../settings/ocr-settings";
import type { OcrDraft } from "../settings/ocr-settings";
import { SettingsLink } from "../settings/settings-link";

/** "DeepSeek API · deepseek-v4-pro", or a note that nothing is set. */
export const effectiveLabel = (e: OcrEffective): string =>
  e.model ? `${e.provider} · ${e.model}` : "not set up yet";

type Mode = "global" | "custom";

const OcrProjectForm = (props: {
  projectId: string;
  settings: OcrProjectSettings;
}) => {
  const { settings } = props;
  const client = useQueryClient();
  const defaults = useOcrSettings().data?.provider;
  const own =
    settings.override.mode === "custom" ? settings.override : undefined;
  const [mode, setMode] = useState<Mode>(settings.override.mode);
  const [draft, setDraft] = useState<OcrDraft>(() => draftOf(own));
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      saveProjectOcr(
        props.projectId,
        mode === "global"
          ? { mode: "global" }
          : { mode: "custom", ...providerInput(draft) }
      ),
    onSuccess: (next) => {
      client.setQueryData(projectOcrKey(props.projectId), next);
      setDraft(
        draftOf(next.override.mode === "custom" ? next.override : undefined)
      );
      setSaved(true);
    },
  });
  const changed = mode !== settings.override.mode || mode === "custom";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <RadioGroup
        value={mode}
        onValueChange={(value) => {
          setMode(value as Mode);
          setSaved(false);
          // A new override starts from the default provider, so changing only the model is one edit.
          if (value === "custom" && !own) {
            setDraft(draftOf(defaults));
          }
        }}
        aria-label="Which provider this project's reviews use"
      >
        <div className="flex items-start gap-2">
          <RadioGroupItem
            id="ocr-project-global"
            value="global"
            className="mt-0.5"
          />
          <Label
            htmlFor="ocr-project-global"
            className="flex flex-col items-start gap-0.5 font-normal"
          >
            <span>Use the default ({effectiveLabel(settings.global)})</span>
            {!settings.global.configured && (
              <span className={muted}>
                Set it up in{" "}
                <SettingsLink section={OCR_SECTION} className="underline">
                  Settings
                </SettingsLink>
                .
              </span>
            )}
          </Label>
        </div>
        <div className="flex items-start gap-2">
          <RadioGroupItem
            id="ocr-project-custom"
            value="custom"
            className="mt-0.5"
          />
          <Label htmlFor="ocr-project-custom" className="font-normal">
            Use its own provider
          </Label>
        </div>
      </RadioGroup>
      {mode === "custom" && (
        <fieldset
          disabled={save.isPending}
          className="flex flex-col gap-4 pl-6 disabled:opacity-60"
        >
          <OcrProviderFields
            id="ocr-project"
            draft={draft}
            onChange={(next) => {
              setDraft(next);
              setSaved(false);
            }}
            hasKey={!!own?.hasKey}
            keyHint="Leave empty to use the default key."
          />
          <OcrTestButton draft={draft} projectId={props.projectId} />
        </fieldset>
      )}
      {changed && (
        <Button
          type="submit"
          size="sm"
          className="w-fit"
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      )}
      {save.error && (
        <div role="alert">
          <Note error>{save.error.message}</Note>
        </div>
      )}
      {saved && (
        <p role="status" className={muted}>
          Reviews in this project use{" "}
          {effectiveLabel(save.data?.effective ?? settings.effective)}.
        </p>
      )}
    </form>
  );
};

/** Which provider Open Code Review uses in this project: the default, or its own. */
export const OcrProjectSettingsBlock = ({
  projectId,
}: {
  projectId: string;
}) => {
  const query = useProjectOcr(projectId);
  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="ocr-project-title"
    >
      <div className="flex flex-col">
        <h2 id="ocr-project-title" className="font-semibold">
          Open Code Review
        </h2>
        <p className={muted}>
          The model that reviews this project&apos;s pull requests. Use another
          account, gateway or model than the default when this codebase needs
          one.
        </p>
      </div>
      {query.error && <Note error>{query.error.message}</Note>}
      {!query.data && !query.error && <p className={muted}>Loading…</p>}
      {query.data && (
        <OcrProjectForm projectId={projectId} settings={query.data} />
      )}
    </section>
  );
};
