import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BotIcon, FileIcon, SendIcon, SquareSlashIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type {
  ComposerSendResult,
  ProjectView,
  SessionSummary,
} from "../../../shared/types";
import {
  fetchComposerAgents,
  fetchComposerCommands,
  searchComposerFiles,
  sendComposerMessage,
} from "../../api";
import { StatusDot } from "../../components/status";
import { envOfDirectory, envTone } from "../../derive";
import type { Checkout } from "../checkouts/checkouts";
import { caretCoordinates } from "./caret";
import {
  deleteMentionBefore,
  insertCommand,
  insertMention,
  rebase,
  triggerAt,
} from "./composer-text";
import type { ComposerValue, Trigger } from "./composer-text";

const FILE_DEBOUNCE_MS = 150;
const SUGGESTION_LIMIT = 50;
const LOOKUP_STALE_MS = 60_000;

/** One row of the suggestion list. */
interface Suggestion {
  key: string;
  group: "Commands" | "Files" | "Agents";
  label: string;
  description?: string;
  note?: string;
  disabled?: boolean;
  choose: () => void;
}

const matchRank = (name: string, query: string): number => {
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n.startsWith(q)) {
    return 0;
  }
  return n.includes(q) ? 1 : -1;
};

/** Items matching `query`, the ones starting with it first. */
const ranked = <T,>(items: T[], query: string, name: (item: T) => string) =>
  items
    .map((item) => ({ item, rank: matchRank(name(item), query) }))
    .filter((r) => r.rank >= 0)
    .toSorted((a, b) => a.rank - b.rank)
    .map((r) => r.item);

const useDebounced = <T,>(value: T, ms: number): T => {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setCurrent(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return current;
};

const sentNotice = (result: ComposerSendResult): string => {
  switch (result.kind) {
    case "command": {
      return result.queued
        ? `Queued /${result.name}: it runs when the current turn ends.`
        : `Running /${result.name}.`;
    }
    case "interrupt": {
      return "Stopped the running turn.";
    }
    case "new": {
      return "Started a new conversation in this checkout.";
    }
    default: {
      return result.queued
        ? "Queued: the agent reads it when its turn ends."
        : "Sent to the agent.";
    }
  }
};

const commandNote = (c: { hub?: boolean; shadowed?: boolean }) => {
  if (c.hub) {
    return "hub";
  }
  return c.shadowed ? "hidden by the hub's command" : undefined;
};

/** Where the composer sends: the checkout's own container, else the project's. */
const targetOf = (view: ProjectView, directory: string) => {
  const env = envOfDirectory(view, directory);
  const runtime = env?.runtime ?? view.runtime;
  const ready =
    runtime.containerState === "running" && runtime.opencode === "healthy";
  return {
    label: env ? "worktree container" : "project container",
    ready,
    tone: envTone({ runtime }),
    why: env
      ? "This worktree's container isn't running: start it from the Worktrees tab."
      : "The project's container isn't running: start the project first.",
  };
};

/**
 * The Conversation tab's message box: `/` suggests commands at the start of the message, `@` suggests files and
 * agents, and the line above it names the project, checkout and environment it sends to.
 */
export const Composer = (props: {
  view: ProjectView;
  checkout: Checkout;
  session: SessionSummary;
  onSent: (notice: string) => void;
  /** A conversation `/new` started. */
  onStarted?: (sessionId: string) => void;
  /** What the box starts with; for stories. */
  initialText?: string;
}) => {
  const { view, checkout, session } = props;
  const projectId = view.project.id;
  const { directory } = checkout;
  const target = targetOf(view, directory);
  const running = session.status !== "idle";

  const [value, setValue] = useState<ComposerValue>({
    mentions: [],
    text: props.initialText ?? "",
  });
  const [caret, setCaret] = useState(props.initialText?.length ?? 0);
  const [focused, setFocused] = useState(props.initialText !== undefined);
  const [dismissed, setDismissed] = useState<number>();
  const [activeKey, setActiveKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const pendingCaret = useRef<number>(undefined);
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });
  const [aria, setAria] = useState<{ list?: string; active?: string }>({});

  const trigger: Trigger | undefined =
    focused && target.ready ? triggerAt(value, caret) : undefined;
  const open = trigger !== undefined && trigger.start !== dismissed;
  const fileQuery = useDebounced(
    trigger?.kind === "mention" ? trigger.query : undefined,
    FILE_DEBOUNCE_MS
  );

  const commands = useQuery({
    enabled: open && trigger?.kind === "command",
    queryFn: () => fetchComposerCommands(projectId, directory),
    queryKey: ["composer-commands", projectId, directory],
    staleTime: LOOKUP_STALE_MS,
  });
  const agents = useQuery({
    enabled: open && trigger?.kind === "mention",
    queryFn: () => fetchComposerAgents(projectId, directory),
    queryKey: ["composer-agents", projectId, directory],
    staleTime: LOOKUP_STALE_MS,
  });
  const files = useQuery({
    enabled: open && fileQuery !== undefined,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      searchComposerFiles(projectId, directory, fileQuery ?? "", signal),
    queryKey: ["composer-files", projectId, directory, fileQuery],
  });

  const apply = (next: { value: ComposerValue; caret: number }) => {
    setValue(next.value);
    setCaret(next.caret);
    pendingCaret.current = next.caret;
  };

  const suggestions: Suggestion[] = [];
  if (open && trigger.kind === "command") {
    for (const c of ranked(
      commands.data?.commands ?? [],
      trigger.query,
      (x) => x.name
    )) {
      suggestions.push({
        choose: () => apply(insertCommand(value, caret, c.name)),
        description: c.description,
        disabled: c.shadowed,
        group: "Commands",
        key: `command:${c.shadowed ? "shadowed:" : ""}${c.name}`,
        label: `/${c.name}`,
        note: commandNote(c),
      });
    }
  }
  if (open && trigger.kind === "mention") {
    for (const path of (files.data?.files ?? []).slice(0, SUGGESTION_LIMIT)) {
      suggestions.push({
        choose: () =>
          apply(
            insertMention(value, trigger, caret, { kind: "file", name: path })
          ),
        group: "Files",
        key: `file:${path}`,
        label: path,
      });
    }
    for (const a of ranked(
      agents.data?.agents ?? [],
      trigger.query,
      (x) => x.id
    )) {
      suggestions.push({
        choose: () =>
          apply(
            insertMention(value, trigger, caret, { kind: "agent", name: a.id })
          ),
        description: a.description,
        group: "Agents",
        key: `agent:${a.id}`,
        label: `@${a.id}`,
      });
    }
  }
  const selectable = suggestions.filter((s) => !s.disabled);
  const active =
    selectable.find((s) => s.key === activeKey) ?? selectable.at(0);

  // Put the caret where an insertion left it, once the textarea holds the new text.
  useLayoutEffect(() => {
    const at = pendingCaret.current;
    if (at !== undefined && textarea.current) {
      pendingCaret.current = undefined;
      textarea.current.setSelectionRange(at, at);
    }
  });

  // Anchor the list under the `/` or `@` that opened it.
  const triggerStart = open ? trigger.start : undefined;
  useLayoutEffect(() => {
    if (triggerStart === undefined || !textarea.current) {
      return;
    }
    const c = caretCoordinates(textarea.current, triggerStart);
    setAnchor({ left: c.left, top: c.top + c.height });
  }, [triggerStart, value.text]);

  // cmdk names its list and items itself; read the ids back for the textarea's combobox attributes.
  const activeValue = active?.key;
  useLayoutEffect(() => {
    const listEl = list.current;
    const next = {
      active:
        listEl?.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]')
          ?.id ?? undefined,
      list: listEl?.id ?? undefined,
    };
    setAria((prev) =>
      prev.list === next.list && prev.active === next.active ? prev : next
    );
  }, [open, activeValue, suggestions.length]);

  const move = (step: number) => {
    if (selectable.length === 0) {
      return;
    }
    const index = active ? selectable.indexOf(active) : -1;
    const next = (index + step + selectable.length) % selectable.length;
    setActiveKey(selectable[next].key);
  };

  const send = () => {
    if (!value.text.trim() || busy || !target.ready) {
      return;
    }
    setBusy(true);
    sendComposerMessage(projectId, session.id, {
      mentions: value.mentions,
      text: value.text,
    })
      .then(
        (result) => {
          setValue({ mentions: [], text: "" });
          setCaret(0);
          setError(undefined);
          props.onSent(sentNotice(result));
          if (result.kind === "new") {
            props.onStarted?.(result.sessionId);
          }
        },
        (error_: unknown) =>
          setError(error_ instanceof Error ? error_.message : String(error_))
      )
      .finally(() => setBusy(false));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
      return;
    }
    if (open && selectable.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        move(e.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && active) {
        e.preventDefault();
        active.choose();
        return;
      }
    }
    if (open && e.key === "Escape") {
      e.preventDefault();
      setDismissed(trigger.start);
      return;
    }
    const el = e.currentTarget;
    if (e.key === "Backspace" && el.selectionStart === el.selectionEnd) {
      const out = deleteMentionBefore(value, el.selectionStart);
      if (out) {
        e.preventDefault();
        apply(out);
      }
    }
  };

  const syncCaret = () => setCaret(textarea.current?.selectionStart ?? 0);

  const groups = (["Commands", "Files", "Agents"] as const)
    .map((g) => ({ name: g, items: suggestions.filter((s) => s.group === g) }))
    .filter((g) => g.items.length > 0);
  const loading =
    (trigger?.kind === "command" && commands.isPending) ||
    (trigger?.kind === "mention" && (files.isPending || agents.isPending));
  const failure = commands.error ?? agents.error ?? files.error;

  let placeholder = "Message the agent… / for commands, @ for files and agents";
  if (!target.ready) {
    placeholder = "Message the agent…";
  } else if (running) {
    placeholder = "Message the agent; it's queued behind the current turn…";
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
        <span>To</span>
        <span className="text-foreground font-medium">{view.project.name}</span>
        <span aria-hidden>/</span>
        <span className="text-foreground font-medium">
          {checkout.worktree?.branch ?? checkout.label}
        </span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1">
          <StatusDot tone={target.tone} />
          {target.label}
        </span>
      </div>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next && trigger) {
            setDismissed(trigger.start);
          }
        }}
      >
        <div className="relative">
          <label htmlFor="session-prompt" className="sr-only">
            Message the agent
          </label>
          <Textarea
            ref={textarea}
            id="session-prompt"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? aria.list : undefined}
            aria-activedescendant={open ? aria.active : undefined}
            aria-describedby={target.ready ? undefined : "composer-why"}
            disabled={!target.ready}
            placeholder={placeholder}
            value={value.text}
            onChange={(e) => {
              const next = rebase(value, e.target.value);
              setValue(next);
              setCaret(e.target.selectionStart);
              if (!triggerAt(next, e.target.selectionStart)) {
                setDismissed(undefined);
              }
            }}
            onSelect={syncCaret}
            onClick={syncCaret}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
          />
          <PopoverAnchor asChild>
            <span
              aria-hidden
              className="pointer-events-none absolute size-0"
              style={{ left: anchor.left, top: anchor.top }}
            />
          </PopoverAnchor>
        </div>
        <PopoverContent
          align="start"
          className="w-[min(28rem,calc(100vw-2rem))] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (e.target === textarea.current) {
              e.preventDefault();
            }
          }}
          // Keep the textarea focused when an item is clicked.
          onMouseDown={(e) => e.preventDefault()}
        >
          <Command
            shouldFilter={false}
            value={active?.key ?? ""}
            onValueChange={setActiveKey}
          >
            <CommandList ref={list} aria-label="Suggestions">
              <CommandEmpty>
                {(() => {
                  if (failure) {
                    return failure.message;
                  }
                  return loading ? "Loading…" : "Nothing matches.";
                })()}
              </CommandEmpty>
              {groups.map((g) => (
                <CommandGroup key={g.name} heading={g.name}>
                  {g.items.map((s) => (
                    <CommandItem
                      key={s.key}
                      value={s.key}
                      disabled={s.disabled}
                      onSelect={() => s.choose()}
                    >
                      {g.name === "Commands" && <SquareSlashIcon />}
                      {g.name === "Files" && <FileIcon />}
                      {g.name === "Agents" && <BotIcon />}
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-mono text-xs">
                            {s.label}
                          </span>
                          {s.note && (
                            <span className="text-muted-foreground bg-muted rounded px-1 text-[10px] uppercase">
                              {s.note}
                            </span>
                          )}
                        </span>
                        {s.description && (
                          <span className="text-muted-foreground truncate text-xs">
                            {s.description}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {!target.ready && (
        <p id="composer-why" className="text-muted-foreground text-sm">
          {target.why}
        </p>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <span
          className={cn(
            "text-muted-foreground text-xs max-sm:hidden",
            !target.ready && "invisible"
          )}
        >
          Ctrl+Enter to send
        </span>
        <Button
          type="submit"
          size="sm"
          disabled={busy || !value.text.trim() || !target.ready}
        >
          <SendIcon /> {running ? "Queue" : "Send"}
        </Button>
      </div>
    </form>
  );
};
