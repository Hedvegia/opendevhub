## 0. Prerequisite

- [x] 0.1 Land the uncommitted "Forwarded ports" project settings work (`forwardPorts` in `config.json`, `PortsSettings`, `refreshPorts`)

## 1. Relay protocol

- [x] 1.1 Add `host-listen <port>` to `relay/script.ts`: bind `127.0.0.1:<port>` (plus best-effort `::1`), answer `OK` / `ERR <code>`, keep one control per port, announce `CONN <id>`, and close the listener 2 s after its control closes
- [x] 1.2 Add `host-accept <id>`, sharing the pending-client and pipe code with `agent-accept`
- [x] 1.3 Refuse both verbs in gateway (`ODH_RELAY_REMOTE=1`) mode, and bump the ping reply to `PONG 3` in `script.ts` and `client.ts`
- [x] 1.4 Add `openHostControl(target, port)` / `acceptHostConnection(target, id)` to `relay/client.ts`
- [x] 1.5 Relay tests: listen/accept round trip, `EADDRINUSE`, replacing a control, the grace close, waiting clients timing out, and refusal in gateway mode

## 2. opendevhub tunnel

- [x] 2.1 Pull the control loop, backoff, `CONN` parsing and accept-and-pipe out of `AgentTunnel` into a shared helper, with no behavior change (the agent tests stay green)
- [x] 2.2 Add `HostPortTunnel` in `relay/host-ports.ts`: one per (environment, port), with an `isAllowed(port)` check before dialing, dialing `127.0.0.1` then `::1`, a rate-limited refusal log, and `onStatus`
- [x] 2.3 Tests: an unconfigured port is never dialed, the host refusing closes the client and logs once a minute, reconnect after the relay is lost, and stop closes the pipes

## 3. Environments and settings

- [x] 3.1 Add `hostPorts(override)` to `environments/config.ts`, with tests
- [x] 3.2 Start the host tunnels after the relay is confirmed in `forwardPorts`, and stop them in `closePorts`. Set every port to `unavailable` ("needs the relay") when the relay can't run
- [x] 3.3 Make `refreshPorts` reconcile host tunnels (start added ports, stop removed ones)
- [x] 3.4 Skip devcontainer.json `forwardPorts` entries that are host ports, with a log line
- [x] 3.5 Add `hostPorts: { port, state, reason? }[]` to the in-memory runtime in `shared/types.ts`, publish it through environment events, and keep it out of the database
- [x] 3.6 Environment tests: tunnels start and stop with the environment, refresh adds and removes ports, the relay-less case, and the overlap skip

## 4. API

- [x] 4.1 Add a `projectHostPorts` body in `validation.ts`, and `GET`/`POST /api/projects/:id/host-ports` in `api/projects.ts`
- [x] 4.2 Add the `projectHostPorts` dep in `cli.ts`/`dashboard-api.ts`: save sorted and unique, remove the key when empty, reject overlap with forwarded ports in both directions (the forwarded-ports save gets the reverse check), then call `refreshPorts`
- [x] 4.3 Dashboard API tests: get and save, validation, overlap rejection

## 5. Web UI

- [x] 5.1 Add `fetchProjectHostPorts` / `saveProjectHostPorts` to `web/api.ts`
- [x] 5.2 Add `HostPortsSettings` (shadcn `Input`, `Button`, `Alert`, `Chip`), with the access warning and dedicated `--user-data-dir` hint, and mount it in `project-settings-dialog.tsx` next to `PortsSettings`
- [x] 5.3 Show host port chips with their state and a reason tooltip next to the forwarded ports on the checkout page

## 6. Docs and wrap-up

- [x] 6.1 Add a "Using a browser on the host" guide in `apps/docs`: Chrome with `--remote-debugging-port=9222 --user-data-dir=...`, adding 9222 as a host port, `chrome-devtools-mcp --browser-url http://localhost:9222` / Playwright MCP config, and the security warning
- [x] 6.2 Add to known limitations: host ports need the relay, only work while opendevhub runs, have no port remapping or non-loopback targets, and are shared by all tasks
- [ ] 6.3 Run `pnpm exec ultracite fix`, the test suite and `graphify update .`, then check end to end with a real Chrome and `chrome-devtools-mcp` in a task container
