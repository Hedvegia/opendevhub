/**
 * Runs inside the container (Bun via `BUN_BE_BUN=1 <opencode> -e`, or Node) and relays TCP from
 * 0.0.0.0:$ODH_RELAY_PORT to the container's loopback. Protocol: see the container relay spec §3.
 * With ODH_RELAY_REMOTE=1 it is the gateway (see gateway.ts) and also accepts `<token> <ip> <port>`,
 * connecting to that IP instead of loopback.
 * `agent-listen` / `agent-accept <id>` forward the host's ssh-agent: the relay serves a unix socket at
 * $ODH_AGENT_SOCK and hands each client to opendevhub (see the git and ssh credentials spec §1).
 * `host-listen <port>` / `host-accept <id>` do the same for a TCP port on the container's loopback, so
 * container processes reach a port on the host (see the host port forwarding spec).
 * Constraints: CommonJS, node:net/node:crypto/node:fs only, no single quotes (it is shell-quoted as one arg).
 */
export const RELAY_SCRIPT = `/*odh-relay*/
"use strict";
const net = require("node:net");
const crypto = require("node:crypto");
const fs = require("node:fs");
const token = process.env.ODH_RELAY_TOKEN || "";
const port = Number(process.env.ODH_RELAY_PORT || "4097");
const remote = process.env.ODH_RELAY_REMOTE === "1";
const agentPath = process.env.ODH_AGENT_SOCK || "/tmp/opendevhub-ssh-agent.sock";
if (!token) {
  console.error("odh-relay: ODH_RELAY_TOKEN is not set");
  process.exit(2);
}
const expected = Buffer.from(token);
function tokenOk(candidate) {
  const b = Buffer.from(candidate);
  return b.length === expected.length && crypto.timingSafeEqual(b, expected);
}
function connectTo(hosts, target, done) {
  const codes = [];
  const attempt = (i) => {
    if (i >= hosts.length) {
      return done(codes.includes("ECONNREFUSED") ? "ECONNREFUSED" : codes[codes.length - 1] || "EUNKNOWN");
    }
    const s = net.connect({ host: hosts[i], port: target, allowHalfOpen: true });
    const onError = (err) => {
      codes.push(err.code || "EUNKNOWN");
      s.destroy();
      attempt(i + 1);
    };
    s.once("error", onError);
    s.once("connect", () => {
      s.off("error", onError);
      done(null, s);
    });
  };
  attempt(0);
}
let nextId = 1;
/* A reverse listener: container clients wait in pending until opendevhub accepts them by id. */
function makeListener(bind, onClose) {
  return { servers: [], listening: false, control: null, closeTimer: null, pending: new Map(), bind, onClose };
}
function announce(l, id) {
  if (l.control) l.control.write("CONN " + id + "\\n");
}
function closeServers(l) {
  for (const s of l.servers) {
    try { s.close(); } catch (e) {}
  }
  l.servers = [];
  l.listening = false;
}
function closeListener(l) {
  closeServers(l);
  l.onClose();
  for (const p of l.pending.values()) {
    clearTimeout(p.timer);
    p.client.destroy();
  }
  l.pending.clear();
}
function onClient(l, c) {
  if (!l.control) return c.destroy();
  const id = nextId++;
  c.pause();
  c.on("error", () => c.destroy());
  const timer = setTimeout(() => {
    l.pending.delete(id);
    c.destroy();
  }, 5000);
  l.pending.set(id, { client: c, timer });
  c.once("close", () => {
    const p = l.pending.get(id);
    if (p && p.client === c) {
      clearTimeout(timer);
      l.pending.delete(id);
    }
  });
  announce(l, id);
}
function ready(l) {
  l.control.write("OK\\n");
  for (const id of l.pending.keys()) announce(l, id);
}
function listen(l, conn) {
  if (l.closeTimer) {
    clearTimeout(l.closeTimer);
    l.closeTimer = null;
  }
  const previous = l.control;
  l.control = conn;
  if (previous) previous.destroy();
  conn.on("error", () => conn.destroy());
  conn.on("end", () => conn.destroy());
  conn.on("data", () => {});
  conn.on("close", () => {
    if (l.control !== conn) return;
    l.control = null;
    l.closeTimer = setTimeout(() => {
      l.closeTimer = null;
      if (!l.control) closeListener(l);
    }, 2000);
  });
  conn.resume();
  if (l.listening) return ready(l);
  if (l.servers.length) return;
  l.bind(l, (err) => {
    if (err) {
      closeServers(l);
      if (l.control) l.control.end("ERR " + (err.code || "EUNKNOWN") + "\\n");
      return;
    }
    l.listening = true;
    if (l.control) ready(l);
  });
}
function accept(l, conn, rest, id) {
  const p = l.pending.get(id);
  clearTimeout(p.timer);
  l.pending.delete(id);
  const c = p.client;
  const close = () => {
    c.destroy();
    conn.destroy();
  };
  c.on("close", close);
  conn.on("close", close);
  conn.on("error", close);
  conn.write("OK\\n");
  if (rest.length) c.write(rest);
  c.pipe(conn);
  conn.pipe(c);
  c.resume();
  conn.resume();
}
function parseId(arg) {
  return /^[0-9]+$/.test(arg) ? Number(arg) : -1;
}
const agent = makeListener((l, done) => {
  try { fs.unlinkSync(agentPath); } catch (e) {}
  const server = net.createServer({ allowHalfOpen: true }, (c) => onClient(l, c));
  l.servers.push(server);
  const umask = process.umask(0o177);
  server.on("error", (err) => {
    process.umask(umask);
    console.error("odh-relay: agent socket: " + err.message);
    done(err);
  });
  server.listen(agentPath, () => {
    process.umask(umask);
    try { fs.chmodSync(agentPath, 0o600); } catch (e) {}
    done(null);
  });
}, () => {
  try { fs.unlinkSync(agentPath); } catch (e) {}
});
function acceptAgent(conn, idArg, rest) {
  const id = parseId(idArg);
  if (!agent.pending.has(id)) return conn.end("ERR ENOENT\\n");
  accept(agent, conn, rest, id);
}
const hostPorts = new Map();
/* Binds 127.0.0.1:<port>, then ::1:<port> where it can; only the IPv4 bind decides OK or ERR. */
function bindHostPort(target) {
  return (l, done) => {
    const v4 = net.createServer({ allowHalfOpen: true }, (c) => onClient(l, c));
    l.servers.push(v4);
    v4.once("error", done);
    v4.listen(target, "127.0.0.1", () => {
      v4.off("error", done);
      v4.on("error", (err) => console.error("odh-relay: host port " + target + ": " + err.message));
      if (!l.servers.includes(v4)) return;
      const v6 = net.createServer({ allowHalfOpen: true }, (c) => onClient(l, c));
      l.servers.push(v6);
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (!l.servers.includes(v4)) {
          try { v6.close(); } catch (e) {}
          return;
        }
        done(null);
      };
      v6.on("error", () => {
        l.servers = l.servers.filter((s) => s !== v6);
        finish();
      });
      v6.listen(target, "::1", finish);
    });
  };
}
function listenHost(conn, portArg) {
  if (!/^[0-9]+$/.test(portArg)) return conn.destroy();
  const target = Number(portArg);
  if (target < 1 || target > 65535) return conn.destroy();
  let l = hostPorts.get(target);
  if (!l) {
    l = makeListener(bindHostPort(target), () => {
      if (hostPorts.get(target) === l) hostPorts.delete(target);
    });
    hostPorts.set(target, l);
  }
  listen(l, conn);
}
function acceptHost(conn, idArg, rest) {
  const id = parseId(idArg);
  for (const l of hostPorts.values()) {
    if (l.pending.has(id)) return accept(l, conn, rest, id);
  }
  conn.end("ERR ENOENT\\n");
}
const server = net.createServer({ allowHalfOpen: true }, (client) => {
  let buf = Buffer.alloc(0);
  const timer = setTimeout(() => client.destroy(), 5000);
  client.on("error", () => client.destroy());
  const onData = (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const nl = buf.indexOf(10);
    if (nl === -1 || nl > 256) {
      if (nl > 256 || buf.length > 256) {
        clearTimeout(timer);
        client.destroy();
      }
      return;
    }
    clearTimeout(timer);
    client.off("data", onData);
    client.pause();
    const parts = buf.subarray(0, nl).toString("utf8").trim().split(" ");
    const rest = buf.subarray(nl + 1);
    if (parts.length < 2 || !tokenOk(parts[0])) return client.destroy();
    if (/^(agent|host)-(listen|accept)$/.test(parts[1])) {
      if (remote) return client.destroy();
      if (parts[1] === "agent-listen" && parts.length === 2) return listen(agent, client);
      if (parts[1] === "agent-accept" && parts.length === 3) return acceptAgent(client, parts[2], rest);
      if (parts[1] === "host-listen" && parts.length === 3) return listenHost(client, parts[2]);
      if (parts[1] === "host-accept" && parts.length === 3) return acceptHost(client, parts[2], rest);
      return client.destroy();
    }
    if (parts.length > (remote ? 3 : 2)) return client.destroy();
    if (parts.length === 2 && parts[1] === "ping") return client.end("PONG 3\\n");
    const hosts = parts.length === 3 ? [parts[1]] : ["127.0.0.1", "::1"];
    if (parts.length === 3 && !net.isIP(parts[1])) return client.destroy();
    const portArg = parts[parts.length - 1];
    if (!/^[0-9]+$/.test(portArg)) return client.destroy();
    const target = Number(portArg);
    if (target < 1 || target > 65535) return client.destroy();
    connectTo(hosts, target, (code, upstream) => {
      if (code) return client.end("ERR " + code + "\\n");
      if (client.destroyed) return upstream.destroy();
      const close = () => {
        client.destroy();
        upstream.destroy();
      };
      upstream.on("error", close);
      upstream.on("close", close);
      client.on("close", close);
      client.write("OK\\n");
      if (rest.length) upstream.write(rest);
      client.pipe(upstream);
      upstream.pipe(client);
    });
  };
  client.on("data", onData);
});
server.on("error", (err) => {
  console.error("odh-relay: " + err.message);
  process.exit(1);
});
server.listen(port, "0.0.0.0", () => console.log("odh-relay listening on " + port));
`;
