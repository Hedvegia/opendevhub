import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { RotateCwIcon, TerminalIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import "@xterm/xterm/css/xterm.css";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { useCheckoutContext } from "./checkout-context";
import { checkoutRuntime } from "./checkouts";

export const CheckoutTerminal = ({ fill = false }: { fill?: boolean }) => {
  const { view, checkout } = useCheckoutContext();
  return (
    <TerminalPanel
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

const TerminalPanel = ({
  project,
  directory,
  running,
  fill,
}: {
  project: string;
  directory: string;
  running: boolean;
  fill: boolean;
}) => {
  const storageKey = `terminal-shell:${project}:${directory}`;
  const [shell, setShell] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || "bash";
    } catch {
      return "bash";
    }
  });
  const [status, setStatus] = useState("Connecting…");
  const [retry, setRetry] = useState(0);
  const container = useRef<HTMLDivElement>(null);

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
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container.current);
    fit.fit();
    const params = new URLSearchParams({ directory, project, shell });
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
      fit.fit();
      send({ cols: terminal.cols, rows: terminal.rows, type: "resize" });
    };
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
        terminal.focus();
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
      terminal.dispose();
    };
  }, [project, directory, shell, running, retry]);

  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border",
        fill && "h-full min-h-0"
      )}
    >
      <div className="bg-muted/30 flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
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
            className="bg-background min-w-28 font-mono text-xs"
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
        {running && status !== "Connected" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setRetry((n) => n + 1)}
          >
            <RotateCwIcon className="size-3.5" />
            Reconnect
          </Button>
        )}
      </div>
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
      <p className="bg-muted/30 text-muted-foreground shrink-0 border-t px-3 py-2 text-xs">
        Sessions stay available for 30 minutes after closing.
      </p>
    </section>
  );
};
