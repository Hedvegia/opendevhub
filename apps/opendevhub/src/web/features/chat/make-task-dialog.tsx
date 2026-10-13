import { Alert, AlertDescription } from "@opendevhub/ui/alert";
import { Button } from "@opendevhub/ui/button";
import { Checkbox } from "@opendevhub/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@opendevhub/ui/dialog";
import { Input } from "@opendevhub/ui/input";
import { Label } from "@opendevhub/ui/label";
import { Textarea } from "@opendevhub/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";

import { JIRA_KEY } from "../../../shared/jira";
import type {
  ChatSuggestions,
  ChatView,
  MakeTaskRequest,
  ModelsInfo,
  ProjectView,
} from "../../../shared/types";
import { taskHref } from "../../../shared/urls";
import {
  fetchChatBrief,
  fetchChatSuggestions,
  fetchJiraTicket,
  fetchModels,
  makeTask,
} from "../../api";
import { useDash } from "../../dashboard-context";
import { useNavigate } from "../../routing";
import { formatTokens, specUnavailable } from "../tasks/tasks";
import { rowsToVariants, VariantRows } from "../tasks/variant-rows";
import type { VariantRow } from "../tasks/variant-rows";

/** What the dialog shows while it waits for, or after it got, its drafted brief and suggestions. */
export interface MakeTaskState {
  /** The drafted brief; undefined while it is drafted. */
  brief?: string;
  briefError?: string;
  suggestions?: ChatSuggestions;
  models?: ModelsInfo;
}

/**
 * Make task: turns a chat in a worktree into a task that adopts it as variant 1. The brief is drafted from the
 * chat's own conversation while the dialog is open and fills the field unless the user typed first; the ticket and
 * pull request fields offer what the chat suggests. On success the task's Conversation tab opens.
 */
export const MakeTaskDialog = ({
  view,
  chat,
  onClose,
}: {
  view: ProjectView;
  chat: ChatView;
  onClose: () => void;
}) => {
  const projectId = view.project.id;
  const brief = useQuery({
    gcTime: 0,
    queryFn: ({ signal }) => fetchChatBrief(projectId, chat.id, signal),
    queryKey: ["chat-brief", projectId, chat.id],
    retry: false,
    staleTime: Infinity,
  });
  const suggestions = useQuery({
    queryFn: () => fetchChatSuggestions(projectId, chat.id),
    queryKey: ["chat-suggestions", projectId, chat.id],
  });
  const models = useQuery({
    queryFn: () => fetchModels(projectId),
    queryKey: ["models", projectId],
  });
  return (
    <MakeTaskForm
      view={view}
      chat={chat}
      onClose={onClose}
      state={{
        ...(brief.data ? { brief: brief.data.brief } : {}),
        ...(brief.error ? { briefError: brief.error.message } : {}),
        ...(suggestions.data ? { suggestions: suggestions.data } : {}),
        ...(models.data ? { models: models.data } : {}),
      }}
    />
  );
};

/** The dialog's form, given what was fetched for it; stories render it directly. */
export const MakeTaskForm = ({
  view,
  chat,
  state,
  onClose,
}: {
  view: ProjectView;
  chat: ChatView;
  state: MakeTaskState;
  onClose: () => void;
}) => {
  const { jira } = useDash();
  const navigate = useNavigate();
  const [title, setTitle] = useState(chat.title);
  const [typed, setTyped] = useState<string>();
  const [ticket, setTicket] = useState("");
  const [pull, setPull] = useState("");
  const [spec, setSpec] = useState(false);
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // The draft fills the field until the user types in it.
  const shownBrief = typed ?? state.brief ?? "";
  const drafting =
    typed === undefined && state.brief === undefined && !state.briefError;
  const session = view.sessions.find((s) => s.id === chat.sessionId);
  const specBlocked = state.models?.spec
    ? specUnavailable(state.models.spec)
    : "OpenSpec isn't set up in this project.";
  const tickets = state.suggestions?.tickets ?? [];
  const pulls = state.suggestions?.pullRequests ?? [];
  const key = ticket.trim().toUpperCase();
  const badKey = key !== "" && !JIRA_KEY.test(key);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy || badKey) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      let source: MakeTaskRequest["ticket"];
      if (key) {
        if (!jira?.enabled) {
          throw new Error("Connect Jira in Settings to link a ticket.");
        }
        const t = await fetchJiraTicket(key);
        source = {
          description: t.description,
          instanceUrl: t.instanceUrl,
          key: t.key,
          title: t.title,
        };
      }
      const variants = rowsToVariants(rows, state.models);
      const { task } = await makeTask(view.project.id, chat.id, {
        brief: shownBrief,
        title: title.trim() || chat.title,
        ...(source ? { ticket: source } : {}),
        ...(pull.trim() ? { pullRequest: pull.trim() } : {}),
        ...(spec ? { spec: true } : {}),
        ...(variants.length > 0 ? { variants } : {}),
      });
      onClose();
      await navigate(taskHref(view.project.id, task));
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>Make task</DialogTitle>
          <DialogDescription>
            The task takes this chat as its first variant: the same
            conversation, worktree and branch. Nothing is sent to it.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
          <div className="grid gap-2">
            <Label htmlFor="make-task-title">Title</Label>
            <Input
              id="make-task-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="make-task-brief">Brief</Label>
            <Textarea
              id="make-task-brief"
              rows={8}
              className="min-h-32"
              value={shownBrief}
              placeholder={
                drafting
                  ? "Drafting a brief from the conversation…"
                  : "What the task is for: its goal, decisions so far, open questions"
              }
              aria-busy={drafting}
              onChange={(e) => setTyped(e.target.value)}
            />
            {state.briefError && typed === undefined && (
              <p className="text-muted-foreground text-xs">
                The brief couldn&apos;t be drafted ({state.briefError}). Write
                one, or make the task without it.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="make-task-ticket">Ticket</Label>
            <Input
              id="make-task-ticket"
              value={ticket}
              placeholder="APP-42"
              aria-invalid={badKey}
              onChange={(e) => setTicket(e.target.value)}
            />
            <Suggestions
              items={tickets.map((t) => ({ label: t, value: t }))}
              onPick={setTicket}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="make-task-pull">Pull request</Label>
            <Input
              id="make-task-pull"
              value={pull}
              placeholder="https://…/pulls/12"
              onChange={(e) => setPull(e.target.value)}
            />
            <Suggestions
              items={pulls.map((p) => ({
                label:
                  p.number === undefined
                    ? p.url
                    : `#${p.number}${p.title ? ` ${p.title}` : ""}`,
                value: p.url,
              }))}
              onPick={setPull}
            />
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <Label className="font-normal">
              <Checkbox
                checked={spec}
                disabled={!!specBlocked}
                onCheckedChange={(c) => setSpec(c === true)}
              />{" "}
              Write a spec from this conversation
            </Label>
            <span className="text-muted-foreground">
              {specBlocked ??
                `Runs opsx-propose with the brief in this conversation.${
                  session?.context
                    ? ` It holds ${formatTokens(session.context)} tokens of context.`
                    : ""
                }`}
            </span>
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">
              More variants start in new worktrees from the branch&apos;s base,
              prompted with the brief.
            </span>
            <VariantRows
              rows={rows}
              setRows={setRows}
              models={state.models}
              canAdd
              removable
              addLabel="Add a variant"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || badKey || (spec && !shownBrief.trim())}
            >
              {busy ? "Making…" : "Make task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const Suggestions = (props: {
  items: { label: string; value: string }[];
  onPick: (value: string) => void;
}) =>
  props.items.length > 0 ? (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Suggested:</span>
      {props.items.map((i) => (
        <Button
          key={i.value}
          type="button"
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => props.onPick(i.value)}
        >
          {i.label}
        </Button>
      ))}
    </div>
  ) : null;
