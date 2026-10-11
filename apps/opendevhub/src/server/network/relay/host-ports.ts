import net from "node:net";

import type { HostPortStatus } from "../../../shared/types";
import { acceptHostConnection, openHostControl, RelayError } from "./client";
import type { RelayTarget } from "./client";
import { ReverseTunnel } from "./tunnel";

export type HostPortState = Omit<HostPortStatus, "port">;

export interface HostPortTunnelOptions {
  onLog: (line: string) => void;
  onStatus: (status: HostPortState) => void;
  /** Whether the port is still one of the project's host ports, read on every connection. */
  isAllowed: (port: number) => boolean;
  /** The control connection couldn't be opened: the relay may be gone. */
  onRelayLost?: () => void;
  /** Opens the host side; defaults to this machine's loopback on the same port. */
  dial?: (port: number) => Promise<net.Socket>;
  retryMinMs?: number;
  retryMaxMs?: number;
  now?: () => number;
}

const WARN_INTERVAL_MS = 60_000;
/** The only addresses opendevhub dials for a host port, in order. */
const HOST_LOOPBACK = ["127.0.0.1", "::1"] as const;
export const RELAY_NEEDED_REASON = "needs the relay, which can't run here";

const message = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const connectTcp = (host: string, port: number): Promise<net.Socket> =>
  new Promise((resolve, reject) => {
    const s = net.connect({ allowHalfOpen: true, host, port });
    s.once("error", reject);
    s.once("connect", () => {
      s.off("error", reject);
      resolve(s);
    });
  });

/** Connects to `port` on this machine's loopback, trying 127.0.0.1 then ::1. */
export const dialHostLoopback = async (port: number): Promise<net.Socket> => {
  let last: unknown;
  for (const host of HOST_LOOPBACK) {
    try {
      return await connectTcp(host, port);
    } catch (error) {
      last = error;
    }
  }
  throw last;
};

/** Why the relay couldn't listen on the port, in words for the status. */
const listenProblem = (error: unknown): string => {
  if (error instanceof RelayError && error.code === "EADDRINUSE") {
    return "the port is in use in the container";
  }
  return `relay: ${message(error)}`;
};

/**
 * Makes one host port reachable inside one environment: the relay listens on the container's loopback,
 * and each client it announces is piped to the same port on this machine's loopback.
 */
export class HostPortTunnel {
  private lastWarn = -Infinity;
  private status?: string;
  private readonly tunnel: ReverseTunnel;

  readonly port: number;
  private readonly opts: HostPortTunnelOptions;
  constructor(target: RelayTarget, port: number, opts: HostPortTunnelOptions) {
    this.port = port;
    this.opts = opts;
    this.tunnel = new ReverseTunnel({
      accept: (id) => acceptHostConnection(target, id),
      allow: () => opts.isAllowed(port),
      dial: () => (opts.dial ?? dialHostLoopback)(port),
      onDialFailed: (error) => {
        const code =
          error instanceof Error && "code" in error ? error.code : undefined;
        this.warn(
          `host port ${port}: refused on this machine (${typeof code === "string" ? code : message(error)}); is anything listening there?`
        );
      },
      onLost: () =>
        this.setStatus({
          reason: "lost the relay connection; reconnecting",
          state: "unavailable",
        }),
      onOpenFailed: (error) => {
        this.setStatus({ reason: listenProblem(error), state: "unavailable" });
        if (!(error instanceof RelayError)) {
          this.opts.onRelayLost?.();
        }
      },
      onOpened: () => this.setStatus({ state: "forwarded" }),
      open: () => openHostControl(target, port),
      retryMaxMs: opts.retryMaxMs,
      retryMinMs: opts.retryMinMs,
    });
  }

  start(): void {
    this.tunnel.start();
  }

  stop(): void {
    this.tunnel.stop();
  }

  private setStatus(status: HostPortState): void {
    if (this.tunnel.isStopped) {
      return;
    }
    const key = `${status.state}:${status.reason ?? ""}`;
    if (key === this.status) {
      return;
    }
    this.status = key;
    this.opts.onStatus(status);
    this.opts.onLog(
      status.state === "unavailable"
        ? `host port ${this.port}: unavailable (${status.reason})`
        : `host port ${this.port}: forwarded`
    );
  }

  private warn(line: string): void {
    const now = (this.opts.now ?? Date.now)();
    if (now - this.lastWarn < WARN_INTERVAL_MS) {
      return;
    }
    this.lastWarn = now;
    this.opts.onLog(line);
  }
}
