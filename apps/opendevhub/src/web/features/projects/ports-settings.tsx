import { Alert, AlertDescription } from "@opendevhub/ui/alert";
import { Button } from "@opendevhub/ui/button";
import { Input } from "@opendevhub/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import {
  fetchProjectHostPorts,
  fetchProjectPorts,
  saveProjectHostPorts,
  saveProjectPorts,
} from "../../api";
import { Chip, muted } from "../../components/page";
import { Tip } from "../../components/tip";

const MAX_PORT = 65_535;

const parsePort = (text: string): number | undefined => {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= 1 && n <= MAX_PORT ? n : undefined;
};

interface PortListProps {
  projectId: string;
  /** Tells the two lists apart in the query cache and in element ids. */
  kind: "ports" | "host-ports";
  title: ReactNode;
  description: ReactNode;
  placeholder: string;
  inputLabel: string;
  removeLabel: (port: number) => string;
  fetch: (
    projectId: string,
    signal?: AbortSignal
  ) => Promise<{ ports: number[] }>;
  save: (projectId: string, ports: number[]) => Promise<{ ports: number[] }>;
}

/** A project's list of ports, edited as chips; every change is saved right away. */
const PortList = ({
  projectId,
  kind,
  title,
  description,
  placeholder,
  inputLabel,
  removeLabel,
  fetch,
  save,
}: PortListProps) => {
  const queryClient = useQueryClient();
  const queryKey = ["project-ports", kind, projectId] as const;
  const query = useQuery({
    queryFn: ({ signal }) => fetch(projectId, signal),
    queryKey,
  });
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const saveMutation = useMutation({
    mutationFn: (ports: number[]) => save(projectId, ports),
    onSuccess: (saved) => queryClient.setQueryData(queryKey, saved),
  });
  const ports = query.data?.ports;
  const saving = saveMutation.isPending;
  const error = (saveMutation.error ?? query.error)?.message;
  const inputId = `${kind}-${projectId}`;

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
        <h2 className="flex items-center gap-2 font-semibold">{title}</h2>
        <p className={muted}>{description}</p>
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
                aria-label={removeLabel(port)}
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
            <label htmlFor={inputId} className="sr-only">
              {inputLabel}
            </label>
            <Input
              id={inputId}
              className="h-8 w-28 font-mono"
              inputMode="numeric"
              placeholder={placeholder}
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

/** Ports the project forwards to localhost on top of devcontainer.json's `forwardPorts`. */
export const PortsSettings = ({ projectId }: { projectId: string }) => (
  <PortList
    projectId={projectId}
    kind="ports"
    title="Forwarded ports"
    description={
      <>
        Forwarded to <code className="font-mono">localhost</code> along with the{" "}
        <code className="font-mono">forwardPorts</code> in devcontainer.json,
        for every environment of this project. Running containers pick them up
        right away.
      </>
    }
    placeholder="3000"
    inputLabel="Port to forward"
    removeLabel={(port) => `Stop forwarding ${port}`}
    fetch={fetchProjectPorts}
    save={saveProjectPorts}
  />
);

/** Ports on this machine the project's containers reach at the same `localhost` port. */
export const HostPortsSettings = ({ projectId }: { projectId: string }) => (
  <PortList
    projectId={projectId}
    kind="host-ports"
    title={
      <>
        Host ports
        <Tip
          label={
            <div className="flex max-w-sm flex-col gap-2">
              <p className="font-semibold">
                Containers get full access to these ports
              </p>
              <p>
                Every process in the project&apos;s containers, including agents
                and dependencies, can use whatever listens on a host port. A
                Chrome debugging port gives full control of that browser, its
                cookies and logins.
              </p>
              <p>
                For Chrome, start a separate instance with its own profile, e.g.{" "}
                <code className="font-mono break-all">
                  --remote-debugging-port=9222
                  --user-data-dir=~/.opendevhub-chrome
                </code>
                , never your everyday profile.
              </p>
            </div>
          }
        >
          <button
            type="button"
            aria-label="Host ports container access warning"
            className="text-warn focus-visible:outline-ring rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <TriangleAlertIcon className="size-4" />
          </button>
        </Tip>
      </>
    }
    description={
      <>
        Reachable inside every environment of this project at{" "}
        <code className="font-mono">localhost</code> on the same port, and
        answered by <code className="font-mono">localhost</code> on this
        machine. Running containers pick them up right away.
      </>
    }
    placeholder="9222"
    inputLabel="Host port to reach from containers"
    removeLabel={(port) => `Stop reaching host port ${port}`}
    fetch={fetchProjectHostPorts}
    save={saveProjectHostPorts}
  />
);
