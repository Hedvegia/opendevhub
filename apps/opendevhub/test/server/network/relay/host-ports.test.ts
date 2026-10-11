import net from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dialHostLoopback,
  HostPortTunnel,
} from "../../../../src/server/network/relay/host-ports";
import type { HostPortState } from "../../../../src/server/network/relay/host-ports";
import { freePort, startRelay } from "../../../helpers/relay";

let relay: Awaited<ReturnType<typeof startRelay>>;
const tunnels: HostPortTunnel[] = [];
const sockets: net.Socket[] = [];
const servers: net.Server[] = [];

beforeEach(async () => {
  relay = await startRelay("secret");
});
afterEach(async () => {
  for (const t of tunnels.splice(0)) {
    t.stop();
  }
  for (const s of sockets.splice(0)) {
    s.destroy();
  }
  await Promise.all(
    servers.splice(0).map((s) => new Promise((r) => s.close(r)))
  );
  await relay.stop();
});

/**
 * The relay and the "host" share this machine, so they can't both own the port: the host service listens
 * on a port of its own, and the tunnel dials that one instead.
 */
async function hostService(): Promise<{ server: net.Server; port: number }> {
  const port = await freePort();
  const server = net.createServer((c) =>
    c.on("data", (d) => c.write(`host:${d}`))
  );
  servers.push(server);
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return { server, port };
}

const dialPort = (port: number) =>
  new Promise<net.Socket>((resolve, reject) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("error", reject);
    s.once("connect", () => resolve(s));
  });

function tunnel(
  port: number,
  hostPort: number,
  isAllowed: (p: number) => boolean = () => true
) {
  const statuses: HostPortState[] = [];
  const logs: string[] = [];
  const onRelayLost = vi.fn();
  let now = 0;
  const t = new HostPortTunnel(
    { host: "127.0.0.1", port: relay.port, token: "secret" },
    port,
    {
      dial: () => dialPort(hostPort),
      isAllowed,
      now: () => now,
      onLog: (l) => logs.push(l),
      onRelayLost,
      onStatus: (s) => statuses.push(s),
      retryMaxMs: 200,
      retryMinMs: 50,
    }
  );
  tunnels.push(t);
  return {
    t,
    statuses,
    logs,
    onRelayLost,
    last: () => statuses.at(-1),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

/** A container process connecting to the host port; resolves with what it got before the close. */
function ask(port: number, request: string): Promise<string> {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1", () => s.write(request));
    sockets.push(s);
    let got = "";
    s.on("data", (d) => {
      got += d.toString();
      resolve(got);
    });
    s.on("error", () => resolve(got));
    s.on("close", () => resolve(got));
  });
}

describe(dialHostLoopback, () => {
  it("falls back to ::1 when nothing listens on 127.0.0.1", async () => {
    const port = await freePort("::1");
    const server = net.createServer((c) => c.end("v6"));
    servers.push(server);
    await new Promise<void>((r) => server.listen(port, "::1", r));
    const s = await dialHostLoopback(port);
    sockets.push(s);
    await expect(
      new Promise((r) => s.once("data", (d) => r(d.toString())))
    ).resolves.toBe("v6");
  });

  it("rejects when nothing listens on either", async () => {
    await expect(dialHostLoopback(await freePort())).rejects.toMatchObject({
      code: "ECONNREFUSED",
    });
  });
});

describe(HostPortTunnel, () => {
  it("pipes a container client to the host side", async () => {
    const port = await freePort();
    const host = await hostService();
    const { t, last, logs } = tunnel(port, host.port);
    t.start();
    await vi.waitFor(() =>
      expect(last()).toStrictEqual({ state: "forwarded" })
    );
    expect(logs).toContain(`host port ${port}: forwarded`);
    await expect(
      Promise.all([ask(port, "one"), ask(port, "two")])
    ).resolves.toStrictEqual(["host:one", "host:two"]);
  });

  it("never dials a port that is no longer configured", async () => {
    const port = await freePort();
    const host = await hostService();
    const dialed = vi.fn();
    host.server.on("connection", dialed);
    let allowed = true;
    const { t, last } = tunnel(port, host.port, () => allowed);
    t.start();
    await vi.waitFor(() => expect(last()?.state).toBe("forwarded"));
    allowed = false;
    await expect(ask(port, "x")).resolves.toBe("");
    expect(dialed).not.toHaveBeenCalled();
  }, 10_000);

  it("leaves the client to time out when nothing listens on this machine, and logs once a minute", async () => {
    const port = await freePort();
    const { t, last, logs, advance } = tunnel(port, await freePort());
    t.start();
    await vi.waitFor(() => expect(last()?.state).toBe("forwarded"));
    const refused = () => logs.filter((l) => l.includes("refused"));
    await expect(ask(port, "a")).resolves.toBe("");
    await expect(ask(port, "b")).resolves.toBe("");
    expect(refused()).toHaveLength(1);
    expect(refused()[0]).toContain("ECONNREFUSED");
    advance(60_000);
    await expect(ask(port, "c")).resolves.toBe("");
    expect(refused()).toHaveLength(2);
  }, 20_000);

  it("reports a port that is taken in the container", async () => {
    const port = await freePort();
    const taken = net.createServer();
    servers.push(taken);
    await new Promise<void>((r) => taken.listen(port, "127.0.0.1", r));
    const { t, last, onRelayLost } = tunnel(port, await freePort());
    t.start();
    await vi.waitFor(() =>
      expect(last()).toStrictEqual({
        reason: "the port is in use in the container",
        state: "unavailable",
      })
    );
    expect(onRelayLost).not.toHaveBeenCalled();
  });

  it("reconnects after the relay restarts and reports the gap", async () => {
    const port = await freePort();
    const host = await hostService();
    const { t, last, onRelayLost } = tunnel(port, host.port);
    t.start();
    await vi.waitFor(() => expect(last()?.state).toBe("forwarded"));
    const relayPort = relay.port;
    await relay.stop();
    await vi.waitFor(() => expect(last()?.state).toBe("unavailable"));
    await vi.waitFor(() => expect(onRelayLost).toHaveBeenCalled());
    relay = await startRelay("secret", { ODH_RELAY_PORT: String(relayPort) });
    await vi.waitFor(() => expect(last()?.state).toBe("forwarded"), {
      timeout: 3000,
    });
    await expect(ask(port, "back")).resolves.toBe("host:back");
  });

  it("stop closes open pipes and the relay stops listening", async () => {
    const port = await freePort();
    const host = await hostService();
    const { t, last, statuses } = tunnel(port, host.port);
    t.start();
    await vi.waitFor(() => expect(last()?.state).toBe("forwarded"));
    const s = net.connect(port, "127.0.0.1", () => s.write("open"));
    sockets.push(s);
    await new Promise((r) => s.once("data", r));
    const closed = new Promise((r) => s.on("close", r));
    const count = statuses.length;
    t.stop();
    await closed;
    expect(statuses).toHaveLength(count);
    await vi.waitFor(
      async () =>
        expect(
          await new Promise((r) => {
            const probe = net.connect(port, "127.0.0.1");
            probe.on("error", (err: NodeJS.ErrnoException) => r(err.code));
            probe.on("connect", () => {
              probe.destroy();
              r("connected");
            });
          })
        ).toBe("ECONNREFUSED"),
      { timeout: 4000, interval: 250 }
    );
  });
});
