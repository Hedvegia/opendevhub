import fs from "node:fs";
import net from "node:net";

import type { SshAgentState } from "../../../shared/types";
import { acceptAgentConnection, openAgentControl } from "./client";
import type { RelayTarget } from "./client";
import { ReverseTunnel } from "./tunnel";

/** Where the relay serves the forwarded agent inside the container. */
export const AGENT_SOCKET = "/tmp/opendevhub-ssh-agent.sock";
/**
 * git's ssh command in containers with forwarding on: ssh with the forwarded agent while it answers, and with the
 * shell's own SSH_AUTH_SOCK otherwise (opendevhub not running, a stale socket after a restart, VS Code's agent).
 * ssh-add exits 2 when it can't reach an agent. opendevhub only removes the setting when it still has this value.
 */
export const AGENT_SSH_COMMAND =
  `sh -c 'if [ -S ${AGENT_SOCKET} ]; then SSH_AUTH_SOCK=${AGENT_SOCKET} ssh-add -l >/dev/null 2>&1; ` +
  `[ $? -eq 2 ] || export SSH_AUTH_SOCK=${AGENT_SOCKET}; fi; exec ssh "$@"' ssh`;

export interface AgentStatus {
  state: Exclude<SshAgentState, "off">;
  reason?: string;
}

export interface AgentTunnelOptions {
  onLog: (line: string) => void;
  onStatus: (status: AgentStatus) => void;
  /** The control connection couldn't be opened: the relay may be gone. */
  onRelayLost?: () => void;
  /** Counts the host agent's keys; defaults to asking it over the socket. */
  keyCount?: (socketPath: string) => Promise<number | undefined>;
  /** The host agent's socket, read on every use; defaults to SSH_AUTH_SOCK. */
  hostSocket?: () => string | undefined;
  retryMinMs?: number;
  retryMaxMs?: number;
  now?: () => number;
}

const WARN_INTERVAL_MS = 60_000;
const KEY_COUNT_TIMEOUT_MS = 2000;
const SSH_AGENTC_REQUEST_IDENTITIES = 11;
const SSH_AGENT_IDENTITIES_ANSWER = 12;
/** uint32 length + type byte + uint32 key count. */
const IDENTITIES_HEADER_BYTES = 9;
export const NO_KEYS_REASON =
  "the ssh-agent on this machine holds no keys; run ssh-add there";

/** Why the host's agent can't be forwarded; undefined when SSH_AUTH_SOCK is a socket. */
export const hostAgentProblem = (
  socketPath: string | undefined
): string | undefined => {
  if (!socketPath) {
    return "SSH_AUTH_SOCK is not set on this machine";
  }
  try {
    return fs.statSync(socketPath).isSocket()
      ? undefined
      : `SSH_AUTH_SOCK (${socketPath}) is not a socket`;
  } catch {
    return `SSH_AUTH_SOCK (${socketPath}) does not exist`;
  }
};

/** How many keys the agent at `socketPath` holds; undefined when it doesn't answer like an ssh-agent. */
export const hostAgentKeyCount = (
  socketPath: string,
  timeoutMs = KEY_COUNT_TIMEOUT_MS
): Promise<number | undefined> =>
  new Promise((resolve) => {
    let buf = Buffer.alloc(0);
    const s = net.connect(socketPath);
    const done = (count: number | undefined) => {
      s.destroy();
      resolve(count);
    };
    s.setTimeout(timeoutMs, () => done(undefined));
    s.on("error", () => done(undefined));
    s.on("close", () => done(undefined));
    s.on("connect", () => {
      const request = Buffer.alloc(5);
      request.writeUInt32BE(1, 0);
      request.writeUInt8(SSH_AGENTC_REQUEST_IDENTITIES, 4);
      s.write(request);
    });
    s.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length < IDENTITIES_HEADER_BYTES) {
        return;
      }
      done(
        buf.readUInt8(4) === SSH_AGENT_IDENTITIES_ANSWER
          ? buf.readUInt32BE(5)
          : undefined
      );
    });
  });

const message = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const connectUnix = (socketPath: string): Promise<net.Socket> =>
  new Promise((resolve, reject) => {
    const s = net.connect(socketPath);
    s.once("error", reject);
    s.once("connect", () => {
      s.off("error", reject);
      resolve(s);
    });
  });

/**
 * Keeps one environment's agent control connection open and pipes each container client the relay
 * announces to the host's ssh-agent. Reconnects with backoff until stopped.
 */
export class AgentTunnel {
  private lastWarn = -Infinity;
  private status?: string;
  private readonly tunnel: ReverseTunnel;

  private readonly opts: AgentTunnelOptions;
  constructor(target: RelayTarget, opts: AgentTunnelOptions) {
    this.opts = opts;
    this.tunnel = new ReverseTunnel({
      accept: (id) => acceptAgentConnection(target, id),
      dial: () => {
        const socketPath = this.hostSocket();
        if (!socketPath) {
          throw new Error("SSH_AUTH_SOCK is not set");
        }
        return connectUnix(socketPath);
      },
      onDialFailed: (error) =>
        this.warn(
          `ssh-agent: can't reach the agent on this machine (${message(error)})`
        ),
      onLost: () =>
        this.setStatus({
          reason: "lost the relay connection; reconnecting",
          state: "unavailable",
        }),
      onOpenFailed: (error) => {
        this.setStatus({
          reason: `relay: ${message(error)}`,
          state: "unavailable",
        });
        this.opts.onRelayLost?.();
      },
      onOpened: () => {
        this.setStatus({ state: "forwarded" });
        void this.checkKeys();
      },
      onPiped: () => void this.checkKeys(),
      open: () => openAgentControl(target),
      retryMaxMs: opts.retryMaxMs,
      retryMinMs: opts.retryMinMs,
    });
  }

  start(): void {
    const problem = hostAgentProblem(this.hostSocket());
    if (problem) {
      this.setStatus({ reason: problem, state: "unavailable" });
      return;
    }
    this.tunnel.start();
  }

  stop(): void {
    this.tunnel.stop();
  }

  private hostSocket(): string | undefined {
    return (
      (this.opts.hostSocket ?? (() => process.env.SSH_AUTH_SOCK))() || undefined
    );
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  private setStatus(status: AgentStatus): void {
    if (this.tunnel.isStopped) {
      return;
    }
    const key = `${status.state}:${status.reason ?? ""}`;
    if (key === this.status) {
      return;
    }
    this.status = key;
    this.opts.onStatus(status);
    if (status.state === "unavailable") {
      this.opts.onLog(`ssh-agent: unavailable (${status.reason})`);
    } else {
      this.opts.onLog(
        status.reason
          ? `ssh-agent: forwarded, but ${status.reason}`
          : "ssh-agent: forwarded"
      );
    }
  }

  /** Marks the forwarded agent as keyless, or clears that once keys show up. Unknown counts change nothing. */
  private async checkKeys(): Promise<void> {
    const socketPath = this.hostSocket();
    if (!socketPath) {
      return;
    }
    const count = await (this.opts.keyCount ?? hostAgentKeyCount)(socketPath);
    if (count === undefined || !this.tunnel.connected) {
      return;
    }
    this.setStatus(
      count === 0
        ? { reason: NO_KEYS_REASON, state: "forwarded" }
        : { state: "forwarded" }
    );
  }

  private warn(line: string): void {
    const now = this.now();
    if (now - this.lastWarn < WARN_INTERVAL_MS) {
      return;
    }
    this.lastWarn = now;
    this.opts.onLog(line);
  }
}
