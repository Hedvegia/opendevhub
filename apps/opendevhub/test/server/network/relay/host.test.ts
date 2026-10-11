import net from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { freePort, startRelay } from "../../../helpers/relay";

type Relay = Awaited<ReturnType<typeof startRelay>>;
let relay: Relay;
const sockets: net.Socket[] = [];
const servers: net.Server[] = [];

beforeEach(async () => {
  relay = await startRelay("secret");
});
afterEach(async () => {
  for (const s of sockets.splice(0)) {
    s.destroy();
  }
  await Promise.all(
    servers.splice(0).map((s) => new Promise((r) => s.close(r)))
  );
  await relay.stop();
});

/** A connection to the relay that sends `header` and collects complete lines. */
function connect(header: string, port = relay.port) {
  const socket = net.connect(port, "127.0.0.1", () => socket.write(header));
  sockets.push(socket);
  const lines: string[] = [];
  let buf = "";
  socket.on("data", (d) => {
    buf += d.toString();
    for (let nl = buf.indexOf("\n"); nl !== -1; nl = buf.indexOf("\n")) {
      lines.push(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  });
  socket.on("error", () => {});
  const closed = new Promise<void>((r) => socket.on("close", () => r()));
  const line = (i: number) =>
    vi.waitFor(() => {
      if (lines.length <= i) {
        throw new Error(`waiting for line ${i}`);
      }
      return lines[i];
    });
  return { socket, lines, closed, line };
}

/** A process in the container connecting to the forwarded host port. */
function containerClient(port: number) {
  const socket = net.connect(port, "127.0.0.1");
  sockets.push(socket);
  let got = "";
  socket.on("data", (d) => (got += d.toString()));
  const failed = new Promise<string>((r) =>
    socket.on("error", (err: NodeJS.ErrnoException) => r(err.code ?? ""))
  );
  const closed = new Promise<void>((r) => socket.on("close", () => r()));
  return { socket, closed, failed, received: () => got };
}

const idOf = (conn: string) => conn.split(" ")[1];

describe("relay host port verbs", () => {
  it("listens on the port, announces a client and pipes it to the accepting connection", async () => {
    const port = await freePort();
    const control = connect(`secret host-listen ${port}\n`);
    await expect(control.line(0)).resolves.toBe("OK");
    const client = containerClient(port);
    client.socket.write("GET /json/version\n");
    const conn = await control.line(1);
    expect(conn).toMatch(/^CONN \d+$/u);
    const accept = connect(`secret host-accept ${idOf(conn)}\n`);
    await expect(accept.line(0)).resolves.toBe("OK");
    await expect(accept.line(1)).resolves.toBe("GET /json/version");
    accept.socket.write("chrome\n");
    await vi.waitFor(() => expect(client.received()).toBe("chrome\n"));
  });

  it("answers ERR EADDRINUSE when the port is taken in the container", async () => {
    const port = await freePort();
    const taken = net.createServer();
    servers.push(taken);
    await new Promise<void>((r) => taken.listen(port, "127.0.0.1", r));
    const control = connect(`secret host-listen ${port}\n`);
    await expect(control.line(0)).resolves.toBe("ERR EADDRINUSE");
    await control.closed;
  });

  it("keeps separate ports apart and answers ERR ENOENT for an unknown id", async () => {
    const [a, b] = [await freePort(), await freePort()];
    const controlA = connect(`secret host-listen ${a}\n`);
    const controlB = connect(`secret host-listen ${b}\n`);
    await controlA.line(0);
    await controlB.line(0);
    containerClient(b);
    await controlB.line(1);
    expect(controlA.lines).toStrictEqual(["OK"]);
    const unknown = connect("secret host-accept 999\n");
    await expect(unknown.line(0)).resolves.toBe("ERR ENOENT");
  });

  it("does not hand agent clients to host-accept", async () => {
    const port = await freePort();
    const control = connect(`secret host-listen ${port}\n`);
    await control.line(0);
    containerClient(port);
    const conn = await control.line(1);
    const wrong = connect(`secret agent-accept ${idOf(conn)}\n`);
    await expect(wrong.line(0)).resolves.toBe("ERR ENOENT");
  });

  it("a second control connection replaces the first and is told about waiting clients", async () => {
    const port = await freePort();
    const first = connect(`secret host-listen ${port}\n`);
    await first.line(0);
    containerClient(port);
    const conn = await first.line(1);
    const second = connect(`secret host-listen ${port}\n`);
    await expect(second.line(0)).resolves.toBe("OK");
    await expect(second.line(1)).resolves.toBe(conn);
    await first.closed;
  });

  it("stops listening 2 s after the control connection goes, and keeps listening on a quick reconnect", async () => {
    const port = await freePort();
    const control = connect(`secret host-listen ${port}\n`);
    await control.line(0);
    control.socket.destroy();
    await new Promise((r) => setTimeout(r, 500));
    const again = connect(`secret host-listen ${port}\n`);
    await expect(again.line(0)).resolves.toBe("OK");
    again.socket.destroy();
    await new Promise((r) => setTimeout(r, 2500));
    await expect(containerClient(port).failed).resolves.toBe("ECONNREFUSED");
  }, 10_000);

  it("closes a client nobody accepts after 5 s", async () => {
    const port = await freePort();
    const control = connect(`secret host-listen ${port}\n`);
    await control.line(0);
    const client = containerClient(port);
    await control.line(1);
    const started = Date.now();
    await client.closed;
    expect(Date.now() - started).toBeGreaterThanOrEqual(4500);
  }, 10_000);

  it.each([
    ["wrong token", "nope host-listen 9222\n"],
    ["port 0", "secret host-listen 0\n"],
    ["port 70000", "secret host-listen 70000\n"],
    ["non-numeric port", "secret host-listen abc\n"],
    ["missing port", "secret host-listen\n"],
  ])("closes silently on %s", async (_name, header) => {
    const control = connect(header);
    await control.closed;
    expect(control.lines).toStrictEqual([]);
  });

  it("is refused by the gateway relay", async () => {
    const gateway = await startRelay("secret", { ODH_RELAY_REMOTE: "1" });
    try {
      const port = await freePort();
      const listen = connect(`secret host-listen ${port}\n`, gateway.port);
      const accept = connect("secret host-accept 1\n", gateway.port);
      await Promise.all([listen.closed, accept.closed]);
      expect([...listen.lines, ...accept.lines]).toStrictEqual([]);
    } finally {
      await gateway.stop();
    }
  });
});
