## Context

Each environment runs a small relay (`network/relay/script.ts`) inside its container. opendevhub reaches it over the container IP, or through the gateway container (`network/gateway.ts`). Today the relay does two things:

- **Forward (container → host):** opendevhub connects with `<token> <port>`, and the relay dials the container's loopback. `PortForwarder` uses this to expose `forwardPorts` on the host.
- **Reverse (host → container), ssh-agent only:** opendevhub holds an `agent-listen` control connection. The relay serves a unix socket and writes `CONN <id>` for each client. opendevhub opens a fresh `agent-accept <id>` connection and pipes it to `SSH_AUTH_SOCK` (`relay/agent.ts`, `AgentTunnel`).

The reverse path is the one this change needs: a container process connects inside the container, and the bytes end up at a host socket. Only the listener type (TCP port instead of unix socket) and the host target (TCP loopback instead of `SSH_AUTH_SOCK`) differ.

The uncommitted "Forwarded ports" settings work adds the pieces this builds on: `forwardPorts` in the project `config.json` entry, a Ports section in the project settings dialog, and `Environments.refreshPorts()`.

## Goals / Non-Goals

**Goals:**

- A container process reaches a host service at `localhost:<port>` with the same port number, so tools like `chrome-devtools-mcp --browser-url http://localhost:9222` work unchanged.
- The host never exposes anything beyond loopback, and opendevhub dials only ports the user listed.
- It works through both routes (direct container IP and gateway) and survives relay restarts.

**Non-Goals:**

- Launching or managing Chrome on the host. The docs explain how; hub-managed browsers may come later.
- Per-task browser isolation (one Chrome or browser context per task).
- Mapping to a different port number, or to a non-loopback host address (e.g. `192.168.x.y:5432`).
- A direct, relay-less route.
- Claude in Chrome (the extension), which talks over native messaging, not TCP.

## Decisions

### 1. Generalize the agent's control/accept pattern to TCP listeners

New relay verbs:

- `<token> host-listen <port>`: binds `127.0.0.1:<port>` (and `::1:<port>` when available; failing to bind `::1` alone is fine). The relay answers `OK`, or `ERR <code>` (e.g. `EADDRINUSE`). The connection then stays open as the control connection for that port, and the relay writes `CONN <id>` for each client.
- `<token> host-accept <id>`: the same as `agent-accept`. The relay answers `OK` and pipes the waiting client.

The relay keeps one control connection per port. A new `host-listen` for the same port replaces the previous control, as `agent-listen` does. When the control closes, the listener closes after the same 2 s grace, so a reconnect doesn't drop the port. Waiting clients are dropped after 5 s, as for the agent.

_Alternative: one control connection for all ports, with `CONN <port> <id>`._ That means fewer sockets, but a settings change would need a new add/remove sub-protocol. Per-port controls make "stop forwarding a port" just "close its control", and reuse the agent's code paths. The number of host ports is small.

_Alternative: put a listener on the host and have the container dial `host.docker.internal`._ Rejected because it binds a non-loopback host address that every container on the bridge can reach, needs `--add-host` on Linux, and Chrome rejects CDP requests whose `Host` header is a name.

The verbs are refused in gateway (`ODH_RELAY_REMOTE=1`) mode, like the agent verbs. The relay protocol version goes to `PONG 3`, so `pingRelay` replaces older relays on reattach.

The relay script's existing constraints still apply: CommonJS, `node:` built-ins only, no single quotes.

### 2. `HostPortTunnel` on the opendevhub side

Add `relay/host-ports.ts`, modeled on `AgentTunnel`, with one instance per (environment, port):

- It opens `host-listen <port>` through the environment's `RelayTarget` (the same routing as the agent, so the gateway route works), and reconnects with backoff.
- On `CONN <id>`, it first checks that the port is still in the project's host ports, using a callback that reads the current setting. Then it dials `127.0.0.1:<port>` and falls back to `[::1]:<port>`, opens `host-accept <id>`, and pipes the two together.
- If the host dial fails, it doesn't accept, so the relay's 5 s timeout closes the client. It also writes a rate-limited log line, one per port per minute.
- It reports `forwarded` / `unavailable(reason)` through `onStatus`.

The shared parts of `AgentTunnel` (the control loop, backoff, `CONN` parsing, accept-and-pipe) get pulled out into a small base or helper that both tunnels use. That's better than copying ~150 lines.

### 3. Lifecycle in `Environments`

- Start the host tunnels where the agent tunnel starts: after the relay is confirmed, in `forwardPorts`. Stop them in `closePorts`.
- `refreshPorts(id)` (from the forwarded-ports work) also reconciles the host tunnels: it starts missing ports and stops removed ones. The host-ports save endpoint calls `refreshPorts`, as the forwarded-ports save already does.
- Host port state lives in the in-memory runtime (`hostPorts: { port, state, reason? }[]`) and is published through the existing environment events. It is never stored, which matches the "only durable runtime fields are stored" requirement.
- If the relay can't run, every configured host port is set to `unavailable` ("needs the relay"), and nothing else is attempted.

### 4. Settings, API and overlap rules

- `config.ts`: `hostPorts(override)` parses the setting the same way `extraForwardPorts` does.
- API: `GET`/`POST /api/projects/:id/host-ports`, with the same validation shape as `projectPorts`. Saving checks the overlap with forwarded ports in both directions and returns a validation error.
- In `forwardPorts`, a devcontainer.json `forwardPorts` entry that is also a host port is skipped with a log line. Otherwise the relay's listener and a container app couldn't both own it, and forwarding it back to the host would loop.

### 5. UI

The project settings dialog gets a `HostPortsSettings` section next to `PortsSettings`. It reuses the same add/remove chips pattern, with an `Alert` for the access warning and the dedicated-profile hint. The checkout page shows host port chips next to forwarded port chips, with the reason as a tooltip when unavailable. Built with Tailwind and shadcn, as the rest of `src/web` is.

## Risks / Trade-offs

- **CDP is full browser control. Any process in the container (dependencies, prompt-injected agents) can read cookies and act as the user in that profile.** → Opt-in per project, a clear warning in settings, and docs that insist on a dedicated `--user-data-dir`. Chrome 136+ ignores `--remote-debugging-port` on the default profile anyway.
- **Container code that reads the relay token can issue `host-listen`.** → Harmless: opendevhub decides what to dial, and checks every `CONN` against the project's current list. A rogue listener can only receive connections for configured ports, which it could open itself anyway.
- **Several tasks share one browser and fight over tabs.** → Documented. Per-task browsers are a non-goal for now.
- **It only works while opendevhub runs.** → Same as forwarded ports. Containers see connection refused, and the docs say so.
- **One extra open socket per (environment × host port).** → The count is small: ports are capped at 100 and are usually 1–2.
- **A port is in use inside the container.** → The status says `unavailable` with `EADDRINUSE`, and the other ports keep working.

## Migration Plan

There's no data migration: `hostPorts` is a new optional key. On upgrade, reattached environments find `PONG 2`, and their relay is replaced with the `PONG 3` script, as on the last protocol bump. Rolling back leaves an ignored `hostPorts` key in `config.json`.

## Open Questions

- Should the docs ship a ready-made `chrome-devtools-mcp` / Playwright MCP snippet for `.opencode` / `.mcp.json`, or just the flags? (Leaning towards a snippet.)
- Later: should opendevhub offer to launch a dedicated headful Chrome when a project has 9222 configured and nothing listens?
