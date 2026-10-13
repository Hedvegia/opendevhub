import { Button } from "@opendevhub/ui/button";
import { Input } from "@opendevhub/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@opendevhub/ui/popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookmarkIcon,
  CheckIcon,
  PencilIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { confirm } from "@/components/confirm-dialog";

import { Tip } from "./tip";

const MAX_NAME = 80;

/** A saved view: a name and the filters it stands for. */
export interface FilterPreset<F> {
  id: number;
  name: string;
  filters: F;
}

/** Where a list's presets are kept, and how to tell two views apart. */
export interface PresetSource<F> {
  /** The query key the presets are cached under. */
  key: readonly unknown[];
  list: (signal: AbortSignal) => Promise<{ presets: FilterPreset<F>[] }>;
  create: (name: string, filters: F) => Promise<unknown>;
  update: (
    id: number,
    changes: { name?: string; filters?: F }
  ) => Promise<unknown>;
  remove: (id: number) => Promise<void>;
  /** The view's search parameters; two views with the same string list the same items. */
  search: (filters: F) => string;
  /** What the popover says while there are no presets. */
  empty: string;
}

const PresetRow = <F,>({
  preset,
  active,
  busy,
  onApply,
  onOverwrite,
  onRename,
  onRemove,
}: {
  preset: FilterPreset<F>;
  active: boolean;
  busy: boolean;
  onApply: () => void;
  onOverwrite: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) => {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(preset.name);
  if (renaming) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      const next = name.trim();
      if (next && next !== preset.name) {
        onRename(next);
      }
      setRenaming(false);
    };
    return (
      <li>
        <form className="flex items-center gap-1" onSubmit={submit}>
          <Input
            autoFocus
            aria-label={`New name for ${preset.name}`}
            className="h-8"
            maxLength={MAX_NAME}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setName(preset.name);
                setRenaming(false);
              }
            }}
          />
          <Button type="submit" size="sm" className="h-8" disabled={busy}>
            Rename
          </Button>
        </form>
      </li>
    );
  }
  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        className="hover:bg-accent hover:text-accent-foreground flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
        onClick={onApply}
      >
        <CheckIcon
          className={`size-4 shrink-0 ${active ? "" : "invisible"}`}
          aria-hidden
        />
        <span className="truncate">{preset.name}</span>
        {active && <span className="sr-only">(current)</span>}
      </button>
      {!active && (
        <Tip label="Replace with the current filters">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Save the current filters to ${preset.name}`}
            disabled={busy}
            onClick={onOverwrite}
          >
            <SaveIcon />
          </Button>
        </Tip>
      )}
      <Tip label="Rename">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`Rename ${preset.name}`}
          disabled={busy}
          onClick={() => {
            setName(preset.name);
            setRenaming(true);
          }}
        >
          <PencilIcon />
        </Button>
      </Tip>
      <Tip label="Delete">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`Delete ${preset.name}`}
          disabled={busy}
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      </Tip>
    </li>
  );
};

/** Named views of a list: switch to one in a click, or save the current one under a name. */
export const FilterPresets = <F,>({
  source,
  current,
  onApply,
}: {
  source: PresetSource<F>;
  current: F;
  onApply: (filters: F) => void;
}) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const presets = useQuery({
    queryFn: ({ signal }) => source.list(signal),
    queryKey: source.key,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: source.key });
  const create = useMutation({
    mutationFn: (next: string) => source.create(next, current),
    onSuccess: () => {
      setName("");
      return refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: number;
      changes: { name?: string; filters?: F };
    }) => source.update(id, changes),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => source.remove(id),
    onSuccess: refresh,
  });
  const list = presets.data?.presets ?? [];
  const search = source.search(current);
  const active = list.find((p) => source.search(p.filters) === search);
  const busy = create.isPending || update.isPending || remove.isPending;
  const error = (create.error ?? update.error ?? remove.error ?? presets.error)
    ?.message;
  const resetErrors = () => {
    create.reset();
    update.reset();
    remove.reset();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = name.trim();
    if (next) {
      resetErrors();
      create.mutate(next);
    }
  };
  const confirmRemove = async (preset: FilterPreset<F>) => {
    const yes = await confirm({
      confirmLabel: "Delete",
      description: "The list and its filters stay as they are.",
      destructive: true,
      title: `Delete the preset “${preset.name}”?`,
    });
    if (yes) {
      resetErrors();
      remove.mutate(preset.id);
    }
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          resetErrors();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 max-w-48">
          <BookmarkIcon />
          <span className="truncate">{active?.name ?? "Presets"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-3">
        <p className="text-sm font-medium">Filter presets</p>
        {presets.isPending && (
          <p className="text-muted-foreground text-sm">Loading…</p>
        )}
        {presets.data && !list.length && (
          <p className="text-muted-foreground text-sm">{source.empty}</p>
        )}
        {!!list.length && (
          <ul className="-mx-1 grid max-h-64 gap-0.5 overflow-y-auto">
            {list.map((preset) => (
              <PresetRow
                key={preset.id}
                preset={preset}
                active={preset.id === active?.id}
                busy={busy}
                onApply={() => {
                  onApply(preset.filters);
                  setOpen(false);
                }}
                onOverwrite={() => {
                  resetErrors();
                  update.mutate({
                    changes: { filters: current },
                    id: preset.id,
                  });
                }}
                onRename={(next) => {
                  resetErrors();
                  update.mutate({ changes: { name: next }, id: preset.id });
                }}
                onRemove={() => void confirmRemove(preset)}
              />
            ))}
          </ul>
        )}
        <form
          className="flex items-center gap-2 border-t pt-3"
          onSubmit={submit}
        >
          <Input
            aria-label="Preset name"
            className="h-8"
            placeholder="Save current filters as…"
            maxLength={MAX_NAME}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            className="h-8"
            disabled={busy || !name.trim()}
          >
            Save
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
};
