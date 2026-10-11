## Why

Agents in task containers can't reach services that run on the host, the main one being a browser. Installing Chrome in every devcontainer is heavy and slow. Pointing `chrome-devtools-mcp` or Playwright MCP at a Chrome that already runs on the host (over CDP) is much lighter. opendevhub's in-container relay already carries traffic from the container to the host for ssh-agent forwarding, so the same tunnel can carry host TCP ports.

## What Changes

- Projects can list **host ports** in their settings (`hostPorts` in the project's `config.json` entry). Each one appears inside every environment of the project at `localhost:<port>` and connects to `localhost:<port>` on the host.
- The relay gains a reverse TCP listener, modeled on its ssh-agent verbs. Inside the container it listens on loopback and announces each connection to opendevhub. opendevhub dials the host port and pipes the two together.
- opendevhub only dials host loopback (`127.0.0.1` / `::1`), and only on ports the project configured. Nothing on the host is bound to a non-loopback address.
- The project settings dialog gets a "Host ports" section next to "Forwarded ports". It carries a clear warning that the container gets full access to whatever listens on that port, and it suggests a dedicated Chrome profile for CDP.
- The environment shows each host port's state (forwarded / unavailable with a reason) in the project log, and on the checkout page next to the forwarded ports.
- Changing host ports in settings takes effect for running environments without restarting them, the same way forwarded ports do.
- The relay protocol version goes up (`PONG 3`), so running containers swap their old relay for the new one.
- The docs get a "Using a browser on the host" guide (Chrome flags, `--user-data-dir`, MCP config), plus the related known limitations.

## Capabilities

### New Capabilities

- `host-port-forwarding`: configuring host ports per project, exposing them inside environments over the relay, the security limits on what opendevhub dials, status reporting, and what happens without the relay.

### Modified Capabilities

<!-- None: the relay and port forwarding have no OpenSpec spec yet. -->

## Impact

- `apps/opendevhub/src/server/network/relay/script.ts`: new `host-listen` / `host-accept` verbs and the protocol version bump.
- `apps/opendevhub/src/server/network/relay/client.ts`, plus a new `relay/host-ports.ts` (a tunnel like `AgentTunnel`, but one per listener).
- `apps/opendevhub/src/server/environments/environments.ts` and `config.ts`: start, stop and refresh host tunnels next to `forwardPorts` and the agent tunnel. Read `hostPorts` from project settings.
- `apps/opendevhub/src/server/api/projects.ts`, `validation.ts`, `cli.ts`, `dashboard-api.ts`: get and save host ports.
- `apps/opendevhub/src/shared/types.ts`: host port state in the environment runtime.
- `apps/opendevhub/src/web`: the "Host ports" settings section and its status on the checkout page.
- `apps/docs`: a guide and known-limitations entries.
- Builds on the uncommitted project "Forwarded ports" settings (`forwardPorts` in `config.json`, `refreshPorts`), which should land first.
