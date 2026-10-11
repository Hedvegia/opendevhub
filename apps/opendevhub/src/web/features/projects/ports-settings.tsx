import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { fetchProjectPorts, saveProjectPorts } from "../../api";
import { Chip, muted } from "../../components/page";

const MAX_PORT = 65_535;

const portsKey = (projectId: string) => ["project-ports", projectId] as const;

const parsePort = (text: string): number | undefined => {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= 1 && n <= MAX_PORT ? n : undefined;
};

/** Ports the project forwards to localhost on top of devcontainer.json's `forwardPorts`. */
export const PortsSettings = ({ projectId }: { projectId: string }) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryFn: ({ signal }) => fetchProjectPorts(projectId, signal),
    queryKey: portsKey(projectId),
  });
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const saveMutation = useMutation({
    mutationFn: (ports: number[]) => saveProjectPorts(projectId, ports),
    onSuccess: (saved) => queryClient.setQueryData(portsKey(projectId), saved),
  });
  const ports = query.data?.ports;
  const saving = saveMutation.isPending;
  const error = (saveMutation.error ?? query.error)?.message;

  const add = (e: FormEvent) => {
    e.preventDefault();
    const port = parsePort(draft);
    if (port === undefined || !ports) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft("");
    if (!ports.includes(port)) {
      saveMutation.mutate([...ports, port]);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col">
        <h3 className="font-semibold">Forwarded ports</h3>
        <p className={muted}>
          Forwarded to <code className="font-mono">localhost</code> along with
          the <code className="font-mono">forwardPorts</code> in
          devcontainer.json, for every environment of this project. Running
          containers pick them up right away.
        </p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!ports && !error && <p className={muted}>Loading…</p>}
      {ports && (
        <div className="flex flex-wrap items-center gap-2">
          {ports.map((port) => (
            <Chip key={port} className="gap-1 font-mono">
              {port}
              <button
                type="button"
                aria-label={`Stop forwarding ${port}`}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                disabled={saving}
                onClick={() =>
                  saveMutation.mutate(ports.filter((p) => p !== port))
                }
              >
                <XIcon className="size-3" />
              </button>
            </Chip>
          ))}
          <form className="flex items-center gap-2" onSubmit={add}>
            <label htmlFor={`port-${projectId}`} className="sr-only">
              Port to forward
            </label>
            <Input
              id={`port-${projectId}`}
              className="h-8 w-28 font-mono"
              inputMode="numeric"
              placeholder="3000"
              value={draft}
              disabled={saving}
              aria-invalid={invalid}
              onChange={(e) => {
                setDraft(e.target.value);
                setInvalid(false);
              }}
              autoComplete="off"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={saving || draft.trim() === ""}
            >
              <PlusIcon /> Add
            </Button>
          </form>
        </div>
      )}
      {invalid && (
        <p className="text-destructive text-sm">
          A port is a whole number from 1 to {MAX_PORT}.
        </p>
      )}
    </section>
  );
};
