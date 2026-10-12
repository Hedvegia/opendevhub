import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  CheckIcon,
  CopyIcon,
  PlusIcon,
  RotateCwIcon,
  TerminalIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import "@xterm/xterm/css/xterm.css";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { useCheckoutContext } from "./checkout-context";
import { checkoutRuntime } from "./checkouts";

export const CheckoutTerminal = ({ fill = false }: { fill?: boolean }) => {
  const { view, checkout } = useCheckoutContext();
  return (
    <TerminalSidebar
      key={`${view.project.id}:${checkout.directory}`}
      project={view.project.id}
      directory={checkout.directory}
      fill={fill}
      running={
        checkoutRuntime(view, checkout.directory).containerState === "running"
      }
    />
  );
};

interface TerminalEntry {
  id: string;
  number: number;
}

interface TerminalList {
  terminals: TerminalEntry[];
  activeId: string;
}

const readTerminals = (storageKey: string): TerminalList => {
  const fallback = { activeId: "", terminals: [{ id: "", number: 1 }] };
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(storageKey) ?? "null"
    );
    if (
      !stored ||
      typeof stored !== "object" ||
      !("terminals" in stored) ||
      !Array.isArray(stored.terminals)
    ) {
      return fallback;
    }
    const terminals = stored.terminals.filter(
      (entry): entry is TerminalEntry =>
        !!entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        Number.isSafeInteger(entry.number) &&
        entry.number > 0
    );
    if (terminals.length === 0) {
      return fallback;
    }
    const active = terminals.find(
      (entry) => "activeId" in stored && entry.id === stored.activeId
    );
    return { activeId: (active ?? terminals[0]).id, terminals };
  } catch {
    return fallback;
  }
};

const TerminalSidebar = (props: {
  project: string;
  directory: string;
  running: boolean;
  fill: boolean;
}) => {
  const storageKey = `terminal-list:${props.project}:${props.directory}`;
  const [list, setList] = useState(() => readTerminals(storageKey));
  const [reloads, setReloads] = useState<Record<string, number>>({});
  const [copyStatus, setCopyStatus] = useState("");
  const terminals = useRef(new Map<string, Terminal>());

  useEffect(() => {
    setCopyStatus("");
  }, [list.activeId]);

  useEffect(() => {
    if (!copyStatus) {
      return;
    }
    const timer = setTimeout(() => setCopyStatus(""), 2000);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(list));
    } catch {
      /* Storage may be disabled. */
    }
  }, [list, storageKey]);

  const createTerminal = () => {
    const id = crypto.randomUUID();
    setList((current) => ({
      activeId: id,
      terminals: [
        ...current.terminals,
        {
          id,
          number:
            Math.max(...current.terminals.map((entry) => entry.number)) + 1,
        },
      ],
    }));
  };

  const copyTerminal = async () => {
    const terminal = terminals.current.get(list.activeId);
    if (!terminal) {
      return;
    }
    const lines: string[] = [];
    const buffer = terminal.buffer.active;
    for (
      let row = buffer.viewportY;
      row < buffer.viewportY + terminal.rows;
      row += 1
    ) {
      lines.push(buffer.getLine(row)?.translateToString(true) ?? "");
    }
    try {
      await navigator.clipboard.writeText(
        terminal.getSelection() || lines.join("\n").trimEnd()
      );
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Unable to copy terminal output");
    }
  };

  return (
    <Tabs
      value={list.activeId || "default"}
      onValueChange={(value) =>
        setList((current) => ({
          ...current,
          activeId: value === "default" ? "" : value,
        }))
      }
      className={cn(
        "bg-background min-w-0 gap-0 overflow-hidden rounded-lg border",
        props.fill && "h-full min-h-0"
      )}
    >
      <div className="bg-muted/30 flex min-w-0 shrink-0 items-center gap-1 border-b px-2">
        <div className="min-w-0 flex-1 [scrollbar-width:none] overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden">
          <TabsList
            variant="line"
            aria-label="Terminals"
            className="flex h-10 justify-start gap-0 p-0"
          >
            {list.terminals.map((entry) => (
              <TabsTrigger
                key={entry.id}
                value={entry.id || "default"}
                className="h-10 flex-none shrink-0 rounded-none px-3 text-xs group-data-[orientation=horizontal]/tabs:after:bottom-0"
              >
                <TerminalIcon className="size-4" />
                {entry.number === 1 ? "Terminal" : `Terminal ${entry.number}`}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8"
            aria-label="New terminal"
            title="New terminal"
            disabled={!props.running}
            onClick={createTerminal}
          >
            <PlusIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8"
            aria-label="Reload terminal"
            title="Reload terminal"
            disabled={!props.running}
            onClick={() =>
              setReloads((current) => ({
                ...current,
                [list.activeId]: (current[list.activeId] ?? 0) + 1,
              }))
            }
          >
            <RotateCwIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8"
            aria-label="Copy terminal output"
            title={copyStatus || "Copy selection or visible terminal output"}
            disabled={!props.running}
            onClick={copyTerminal}
          >
            {copyStatus === "Copied" ? (
              <CheckIcon className="size-4" />
            ) : (
              <CopyIcon className="size-4" />
            )}
          </Button>
          <span role="status" className="sr-only">
            {copyStatus}
          </span>
        </div>
      </div>
      {list.terminals.map((entry) => (
        <TabsContent
          key={entry.id}
          value={entry.id || "default"}
          forceMount
          className="min-h-0 data-[state=inactive]:hidden"
        >
          <TerminalPanel
            {...props}
            active={entry.id === list.activeId}
            terminalId={entry.id}
            reload={reloads[entry.id] ?? 0}
            terminals={terminals}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
};

const TerminalPanel = ({
  project,
  directory,
  running,
  fill,
  terminalId,
  active,
  reload,
  terminals,
}: {
  project: string;
  directory: string;
  running: boolean;
  fill: boolean;
  terminalId: string;
  active: boolean;
  reload: number;
  terminals: RefObject<Map<string, Terminal>>;
}) => {
  const storageKey = `terminal-shell:${project}:${directory}${terminalId ? `:${terminalId}` : ""}`;
  const [shell, setShell] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || "bash";
    } catch {
      return "bash";
    }
  });
  const [status, setStatus] = useState("Connecting…");
  const container = useRef<HTMLDivElement>(null);
  const activate = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!running || !container.current) {
      return;
    }
    setStatus("Connecting…");
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "'Geist Mono Variable', monospace",
      fontSize: 13,
      scrollback: 5000,
    });
    const terminalInstances = terminals.current;
    terminalInstances.set(terminalId, terminal);
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container.current);
    const params = new URLSearchParams({
      directory,
      project,
      shell,
      terminal: terminalId,
    });
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/terminal?${params}`
    );
    let ended = false;
    const send = (msg: unknown) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };
    const resize = () => {
      if (!container.current?.clientWidth || !container.current.clientHeight) {
        return;
      }
      fit.fit();
      send({ cols: terminal.cols, rows: terminal.rows, type: "resize" });
    };
    activate.current = () => {
      resize();
      terminal.focus();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container.current);
    const input = terminal.onData((data) => send({ data, type: "input" }));
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "output") {
        terminal.write(msg.data);
      }
      if (msg.type === "ready") {
        setStatus("Connected");
        resize();
        if (container.current?.clientHeight) {
          terminal.focus();
        }
      }
      if (msg.type === "error") {
        ended = true;
        setStatus(msg.message);
      }
      if (msg.type === "exit") {
        ended = true;
        setStatus(`Shell exited (${msg.exitCode})`);
      }
    };
    ws.onerror = () => setStatus("Unable to connect to terminal");
    ws.onclose = () => {
      if (!ended) {
        setStatus("Disconnected");
      }
    };
    return () => {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      observer.disconnect();
      input.dispose();
      ws.close();
      terminalInstances.delete(terminalId);
      terminal.dispose();
      activate.current = null;
    };
  }, [project, directory, shell, running, terminalId, reload, terminals]);

  useEffect(() => {
    if (active && running) {
      activate.current?.();
    }
  }, [active, running]);

  return (
    <section
      className={cn(
        "flex-col overflow-hidden",
        active ? "flex" : "hidden",
        fill && "h-full min-h-0"
      )}
    >
      {running ? (
        <div
          className={cn(
            "flex overflow-hidden bg-black p-3",
            fill ? "min-h-0 flex-1" : "h-[min(65vh,700px)] min-h-72"
          )}
        >
          <div
            ref={container}
            aria-label="Worktree terminal"
            className="min-h-0 min-w-0 flex-1"
          />
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <TerminalIcon className="size-8 opacity-50" />
          <p className="max-w-64 text-sm">
            Start this checkout&apos;s container to open a terminal.
          </p>
        </div>
      )}
      <div className="bg-muted/30 flex shrink-0 flex-wrap items-center gap-2 border-t px-3 py-1">
        <Select
          value={shell}
          onValueChange={(value) => {
            setShell(value);
            try {
              localStorage.setItem(storageKey, value);
            } catch {
              /* Storage may be disabled. */
            }
          }}
        >
          <SelectTrigger
            aria-label="Terminal shell"
            size="sm"
            className="text-muted-foreground h-6 min-w-20 border-0 bg-transparent font-mono text-xs shadow-none"
          >
            <TerminalIcon className="size-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {["bash", "zsh", "sh", "fish"].map((value) => (
              <SelectItem
                key={value}
                value={value}
                className="font-mono text-xs"
              >
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span
          role="status"
          className="text-muted-foreground ml-auto flex min-w-0 items-center gap-1.5 text-xs"
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              running && status === "Connected"
                ? "bg-emerald-500"
                : "bg-muted-foreground/50"
            )}
          />
          {running ? status : "Container stopped"}
        </span>
      </div>
    </section>
  );
};
