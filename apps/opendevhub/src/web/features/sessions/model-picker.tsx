import { CheckIcon, ChevronDownIcon, CpuIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { modelShortName } from "../../../shared/tasks";
import type { ModelOption, ModelRef, ModelsInfo } from "../../../shared/types";
import { Choice } from "../../components/choice";

const ghost =
  "text-muted-foreground hover:text-foreground hover:bg-accent dark:bg-transparent dark:hover:bg-accent h-7 gap-1 border-0 bg-transparent px-2 text-xs shadow-none";

const isModel = (m: ModelOption, ref: ModelRef | undefined) =>
  ref !== undefined && m.id === ref.id && m.providerID === ref.providerID;

/** The project's models by provider, in the order opencode lists them. */
const byProvider = (models: ModelOption[]) => {
  const groups = new Map<string, ModelOption[]>();
  for (const m of models) {
    const list = groups.get(m.providerID);
    if (list) {
      list.push(m);
    } else {
      groups.set(m.providerID, [m]);
    }
  }
  return [...groups];
};

/**
 * The model a message goes to and its reasoning effort, from the project's models: a searchable list, and the
 * model's variants when it has any. `value` is what's shown, the conversation's or the project's default until the
 * user picks one.
 */
export const ModelPicker = (props: {
  models: ModelsInfo | undefined;
  value: ModelRef | undefined;
  onChange: (model: ModelRef) => void;
  disabled?: boolean;
}) => {
  const { models, value, onChange } = props;
  const [open, setOpen] = useState(false);
  const chosen = models?.models.find((m) => isModel(m, value));
  const label = chosen?.name ?? (value ? modelShortName(value) : "Model");
  const variants = chosen?.variants ?? [];

  return (
    <div className="flex min-w-0 items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={cn(ghost, "min-w-0")}
            disabled={props.disabled || !models}
            aria-label={`Model: ${label}`}
          >
            <CpuIcon />
            <span className="truncate">{label}</span>
            <ChevronDownIcon className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(22rem,calc(100vw-2rem))] p-0"
        >
          <Command>
            <CommandInput placeholder="Search models…" />
            <CommandList>
              <CommandEmpty>No model matches.</CommandEmpty>
              {byProvider(models?.models ?? []).map(([provider, list]) => (
                <CommandGroup key={provider} heading={provider}>
                  {list.map((m) => (
                    <CommandItem
                      key={`${m.providerID}/${m.id}`}
                      value={`${m.providerID}/${m.id} ${m.name}`}
                      onSelect={() => {
                        onChange({ id: m.id, providerID: m.providerID });
                        setOpen(false);
                      }}
                    >
                      <span className="truncate">{m.name}</span>
                      <CheckIcon
                        className={cn(
                          "ml-auto",
                          !isModel(m, value) && "invisible"
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {chosen && variants.length > 0 && (
        <Choice
          label="Reasoning effort"
          value={
            value?.variant && variants.includes(value.variant)
              ? value.variant
              : ""
          }
          onChange={(variant) =>
            onChange({
              id: chosen.id,
              providerID: chosen.providerID,
              ...(variant ? { variant } : {}),
            })
          }
          disabled={props.disabled}
          className={cn(ghost, "w-auto")}
          options={[
            { label: "Default effort", value: "" },
            ...variants.map((v) => ({ label: v, value: v })),
          ]}
        />
      )}
    </div>
  );
};
