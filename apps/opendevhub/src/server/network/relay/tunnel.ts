import type net from "node:net";

/** The `<id>` the relay's control connection announces for each waiting container client. */
const CONN_LINE = /^CONN (?<id>\d+)$/u;
const MAX_LINE_BYTES = 256;

export interface ReverseTunnelOptions {
  /** Opens the relay's control connection (a `*-listen` verb). */
  open: () => Promise<{ socket: net.Socket; rest: Buffer }>;
  /** Opens the host side of a container client. */
  dial: () => Promise<net.Socket>;
  /** Takes the announced container client from the relay (a `*-accept` verb). */
  accept: (id: number) => Promise<net.Socket>;
  /** Checked before dialing; a client it refuses is never dialed and the relay's 5 s timeout closes it. */
  allow?: () => boolean;
  onOpened: () => void;
  onOpenFailed: (error: unknown) => void;
  /** The control connection closed while the tunnel was running. */
  onLost: () => void;
  /** The host side couldn't be dialed; the relay's 5 s timeout closes the client. */
  onDialFailed: (error: unknown) => void;
  onPiped?: () => void;
  retryMinMs?: number;
  retryMaxMs?: number;
}

/**
 * Keeps a relay control connection open, reconnecting with backoff until stopped, and pipes each
 * container client it announces to a freshly dialed host socket.
 */
export class ReverseTunnel {
  private stopped = false;
  private control?: net.Socket;
  private timer?: NodeJS.Timeout;
  private delay: number;
  private readonly pipes = new Set<net.Socket>();

  private readonly opts: ReverseTunnelOptions;
  constructor(opts: ReverseTunnelOptions) {
    this.opts = opts;
    this.delay = opts.retryMinMs ?? 1000;
  }

  get connected(): boolean {
    return this.control !== undefined;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  start(): void {
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.control?.destroy();
    this.control = undefined;
    for (const s of this.pipes) {
      s.destroy();
    }
    this.pipes.clear();
  }

  private async connect(): Promise<void> {
    if (this.stopped) {
      return;
    }
    let socket: net.Socket;
    let rest: Buffer;
    try {
      ({ socket, rest } = await this.opts.open());
    } catch (error) {
      if (this.stopped) {
        return;
      }
      this.opts.onOpenFailed(error);
      this.retry();
      return;
    }
    if (this.stopped) {
      socket.destroy();
      return;
    }
    this.control = socket;
    this.delay = this.opts.retryMinMs ?? 1000;
    this.opts.onOpened();
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf-8");
      for (let nl = buf.indexOf("\n"); nl !== -1; nl = buf.indexOf("\n")) {
        const m = CONN_LINE.exec(buf.slice(0, nl).trim());
        buf = buf.slice(nl + 1);
        if (m?.groups) {
          void this.pipe(Number(m.groups.id));
        }
      }
      if (buf.length > MAX_LINE_BYTES) {
        socket.destroy();
      }
    };
    socket.on("data", onData);
    socket.on("error", () => socket.destroy());
    socket.on("end", () => socket.destroy());
    socket.on("close", () => {
      if (this.control === socket) {
        this.control = undefined;
      }
      if (this.stopped) {
        return;
      }
      this.opts.onLost();
      this.retry();
    });
    if (rest.length) {
      onData(rest);
    }
    socket.resume();
  }

  private retry(): void {
    if (this.stopped) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.connect(), this.delay);
    this.delay = Math.min(this.delay * 2, this.opts.retryMaxMs ?? 30_000);
  }

  private async pipe(id: number): Promise<void> {
    if (this.opts.allow && !this.opts.allow()) {
      return;
    }
    let local: net.Socket;
    try {
      local = await this.opts.dial();
    } catch (error) {
      if (!this.stopped) {
        this.opts.onDialFailed(error);
      }
      return;
    }
    let remote: net.Socket;
    try {
      remote = await this.opts.accept(id);
    } catch {
      local.destroy();
      return;
    }
    if (this.stopped) {
      local.destroy();
      remote.destroy();
      return;
    }
    this.pipes.add(local);
    this.pipes.add(remote);
    const close = () => {
      local.destroy();
      remote.destroy();
      this.pipes.delete(local);
      this.pipes.delete(remote);
    };
    for (const s of [local, remote]) {
      s.on("error", close);
      s.on("close", close);
    }
    local.pipe(remote);
    remote.pipe(local);
    remote.resume();
    this.opts.onPiped?.();
  }
}
