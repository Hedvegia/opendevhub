import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ProjectLinks } from "../../../shared/types";
import {
  fetchJiraCatalog,
  fetchProjectLinks,
  saveProjectLinks,
} from "../../api";
import { muted } from "../../components/page";
import { useDash } from "../../dashboard-context";
import { useJiraQuery } from "../jira/use-jira";

const NO_BOARD = "none";
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/u;

export const projectLinksKey = (projectId: string) =>
  ["project-links", projectId] as const;

/** The Jira board and Forgejo repository the project is linked to; only asked for while either is enabled. */
export const useProjectLinks = (projectId: string | undefined) => {
  const { jira, forgejo } = useDash();
  return useQuery({
    enabled: !!projectId && (!!jira?.enabled || !!forgejo?.enabled),
    queryFn: ({ signal }) => fetchProjectLinks(projectId ?? "", signal),
    queryKey: projectLinksKey(projectId ?? ""),
  });
};

const useSaveLinks = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (links: ProjectLinks) => saveProjectLinks(projectId, links),
    onSuccess: (saved) =>
      queryClient.setQueryData(projectLinksKey(projectId), saved),
  });
};

const JiraBoardPicker = (props: {
  links: ProjectLinks;
  saving: boolean;
  onSave: (links: ProjectLinks) => void;
}) => {
  const catalog = useJiraQuery(["catalog"], fetchJiraCatalog);
  const boards = [...(catalog.data?.boards ?? [])];
  const current = props.links.jiraBoard;
  // Keep the linked board selectable while the catalog loads or after it disappears from Jira.
  if (current && !boards.some((b) => b.id === current.id)) {
    boards.unshift({ ...current, type: "" });
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="project-jira-board" className="text-sm font-medium">
        Jira board
      </label>
      <Select
        value={current ? String(current.id) : NO_BOARD}
        disabled={props.saving}
        onValueChange={(value) => {
          const board = boards.find((b) => String(b.id) === value);
          props.onSave({
            ...props.links,
            jiraBoard: board ? { id: board.id, name: board.name } : undefined,
          });
        }}
      >
        <SelectTrigger id="project-jira-board" className="w-full max-w-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_BOARD}>Not linked</SelectItem>
          {boards.map((b) => (
            <SelectItem key={b.id} value={String(b.id)}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {catalog.error && (
        <p className="text-destructive text-sm">{catalog.error.message}</p>
      )}
    </div>
  );
};

const ForgejoRepositoryInput = (props: {
  links: ProjectLinks;
  saving: boolean;
  onSave: (links: ProjectLinks) => void;
}) => {
  const saved = props.links.forgejoRepository ?? "";
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const value = draft.trim();
  const invalid = value !== "" && !REPOSITORY.test(value);
  const changed = value !== saved;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (changed && !invalid) {
      props.onSave({ ...props.links, forgejoRepository: value || undefined });
    }
  };
  return (
    <form className="flex flex-col gap-1.5" onSubmit={submit}>
      <label htmlFor="project-forgejo-repo" className="text-sm font-medium">
        Forgejo repository
      </label>
      <div className="flex items-center gap-2">
        <Input
          id="project-forgejo-repo"
          className="max-w-sm font-mono"
          placeholder="owner/name"
          value={draft}
          disabled={props.saving}
          aria-invalid={invalid}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {changed && (
          <Button type="submit" size="sm" disabled={props.saving || invalid}>
            {value ? "Link" : "Unlink"}
          </Button>
        )}
      </div>
      {invalid && (
        <p className="text-destructive text-sm">
          Enter the repository as owner/name.
        </p>
      )}
    </form>
  );
};

/** Links the project to a Jira board and a Forgejo repository, so the sidebar lists their tickets and pull requests. */
export const LinksSettings = ({ projectId }: { projectId: string }) => {
  const { jira, forgejo } = useDash();
  const query = useProjectLinks(projectId);
  const save = useSaveLinks(projectId);
  if (!jira?.enabled && !forgejo?.enabled) {
    return null;
  }
  const links = query.data;
  const error = (save.error ?? query.error)?.message;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col">
        <h3 className="font-semibold">Tickets and pull requests</h3>
        <p className={muted}>
          The sidebar lists the open tickets and pull requests of what this
          project is linked to.
        </p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!links && !error && <p className={muted}>Loading…</p>}
      {links && (
        <div className="flex flex-col gap-4">
          {jira?.enabled && (
            <JiraBoardPicker
              links={links}
              saving={save.isPending}
              onSave={(next) => save.mutate(next)}
            />
          )}
          {forgejo?.enabled && (
            <ForgejoRepositoryInput
              links={links}
              saving={save.isPending}
              onSave={(next) => save.mutate(next)}
            />
          )}
        </div>
      )}
    </section>
  );
};
